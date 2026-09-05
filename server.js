const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");

const UID_FILE =
  path.join(DATA_DIR, "uids.json");

const REQUEST_FILE =
  path.join(DATA_DIR, "uid_requests.json");

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  "jay@9090";

const REGISTER_URL =
  "https://www.shreewin55.com/#/register?invitationCode=86286195967";

const HISTORY_URL =
  "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

app.use(express.json({ limit: "1mb" }));

app.use(
  express.urlencoded({
    extended: true
  })
);


/* ================================
   DATA SETUP
================================ */

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}


function ensureFile(file, data) {

  if (!fs.existsSync(file)) {

    fs.writeFileSync(
      file,
      JSON.stringify(
        data,
        null,
        2
      )
    );

  }

}


ensureFile(UID_FILE, []);

ensureFile(
  REQUEST_FILE,
  []
);


function readJSON(file, fallback) {

  try {

    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );

  } catch {

    return fallback;

  }

}


function writeJSON(file, data) {

  fs.writeFileSync(
    file,
    JSON.stringify(
      data,
      null,
      2
    )
  );

}


/* ================================
   ADMIN TOKENS
================================ */

const adminTokens =
  new Map();

const TOKEN_LIFETIME =
  12 * 60 * 60 * 1000;


function createAdminToken() {

  const token =
    crypto.randomBytes(32)
      .toString("hex");

  adminTokens.set(
    token,
    {
      expiresAt:
        Date.now() +
        TOKEN_LIFETIME
    }
  );

  return token;

}


function isValidAdminToken(token) {

  if (!token) return false;

  const session =
    adminTokens.get(token);

  if (!session) return false;

  if (
    Date.now() >
    session.expiresAt
  ) {

    adminTokens.delete(token);

    return false;

  }

  return true;

}


function requireAdmin(
  req,
  res,
  next
) {

  const auth =
    req.headers.authorization ||
    "";

  const token =
    auth.startsWith("Bearer ")
      ? auth.slice(7)
      : "";

  if (
    !isValidAdminToken(token)
  ) {

    return res.status(401).json({

      success: false,

      message:
        "Admin authentication required."

    });

  }

  req.adminToken =
    token;

  next();

}


/* ================================
   EXPIRED UID CLEANUP
================================ */

function cleanExpiredUIDs() {

  const uids =
    readJSON(
      UID_FILE,
      []
    );

  const now =
    Date.now();

  const active =
    uids.filter(item => {

      if (
        !item.expiresAt ||
        item.expiresAt > now
      ) {

        return true;

      }

      return false;

    });


  if (
    active.length !==
    uids.length
  ) {

    writeJSON(
      UID_FILE,
      active
    );

  }

  return active;

}


/* ================================
   STATUS
================================ */

app.get(
  "/api/status",
  (req, res) => {

    res.json({

      success: true,

      online: true,

      service:
        "AMBIKA PANE AI"

    });

  }
);


/* ================================
   CONFIG
================================ */

app.get(
  "/api/config",
  (req, res) => {

    res.json({

      success: true,

      registerUrl:
        REGISTER_URL,

      historyUrl:
        "/api/history"

    });

  }
);


/* ================================
   ADMIN LOGIN
================================ */

app.post(
  "/api/admin/login",
  (req, res) => {

    const password =
      String(
        req.body.password ||
        ""
      );

    if (
      password !==
      ADMIN_PASSWORD
    ) {

      return res.status(401).json({

        success: false,

        message:
          "Invalid admin password."

      });

    }


    const token =
      createAdminToken();


    res.json({

      success: true,

      token,

      expiresIn:
        TOKEN_LIFETIME

    });

  }
);


/* ================================
   ADMIN LOGOUT
================================ */

app.post(
  "/api/admin/logout",
  requireAdmin,
  (req, res) => {

    adminTokens.delete(
      req.adminToken
    );

    res.json({
      success: true
    });

  }
);


/* ================================
   ADMIN UID LIST
================================ */

app.get(
  "/api/admin/uids",
  requireAdmin,
  (req, res) => {

    const uids =
      cleanExpiredUIDs();

    res.json({

      success: true,

      uids

    });

  }
);


/* ================================
   MEMBER REQUEST UID
================================ */

app.post(
  "/api/access/request",
  (req, res) => {

    const uid =
      String(
        req.body.uid ||
        ""
      ).trim();

    const deviceId =
      String(
        req.body.deviceId ||
        ""
      ).trim();


    if (!uid) {

      return res.status(400).json({

        success: false,

        message:
          "UID is required."

      });

    }


    if (!deviceId) {

      return res.status(400).json({

        success: false,

        message:
          "Device ID is required."

      });

    }


    const activeUIDs =
      cleanExpiredUIDs();


    const existing =
      activeUIDs.find(
        item =>
          item.uid === uid
      );


    if (existing) {

      if (
        existing.deviceId &&
        existing.deviceId !==
          deviceId
      ) {

        return res.json({

          success: false,

          status:
            "bound_other_device",

          message:
            "This UID is already active on another device."

        });

      }


      return res.json({

        success: true,

        status: "active",

        uid

      });

    }


    let requests =
      readJSON(
        REQUEST_FILE,
        []
      );


    const sameRequest =
      requests.find(
        item =>
          item.uid === uid &&
          item.deviceId ===
            deviceId &&
          item.status ===
            "pending"
      );


    if (sameRequest) {

      return res.json({

        success: true,

        status: "pending",

        message:
          "Your UID request is already waiting for admin approval."

      });

    }


    requests.push({

      uid,

      deviceId,

      requestedAt:
        Date.now(),

      lastSeenAt:
        Date.now(),

      status:
        "pending"

    });


    if (
      requests.length > 500
    ) {

      requests =
        requests.slice(-500);

    }


    writeJSON(
      REQUEST_FILE,
      requests
    );


    res.json({

      success: true,

      status: "pending",

      message:
        "UID request sent. Waiting for admin approval."

    });

  }
);
/* ================================
   MEMBER ACCESS CHECK
================================ */

app.post(
  "/api/access/check",
  (req, res) => {

    const uid =
      String(
        req.body.uid || ""
      ).trim();

    const deviceId =
      String(
        req.body.deviceId || ""
      ).trim();


    if (!uid || !deviceId) {

      return res.status(400).json({

        success: false,

        status: "invalid",

        message:
          "UID and device ID are required."

      });

    }


    const uids =
      cleanExpiredUIDs();


    const item =
      uids.find(
        x =>
          x.uid === uid
      );


    /* UID NOT ACTIVE */

    if (!item) {

      return res.json({

        success: false,

        status: "inactive",

        message:
          "UID is not active. Request activation."

      });

    }


    /* DEVICE ALREADY BOUND */

    if (
      item.deviceId &&
      item.deviceId !== deviceId
    ) {

      return res.json({

        success: false,

        status:
          "bound_other_device",

        message:
          "This UID is already bound to another device."

      });

    }


    /* FIRST DEVICE CLAIM */

    if (!item.deviceId) {

      item.deviceId =
        deviceId;

      item.boundAt =
        Date.now();


      writeJSON(
        UID_FILE,
        uids
      );

    }


    res.json({

      success: true,

      status: "active",

      uid:
        item.uid,

      deviceId:
        item.deviceId,

      activatedAt:
        item.activatedAt,

      expiresAt:
        item.expiresAt

    });

  }
);


/* ================================
   ACCESS STATUS
================================ */

app.post(
  "/api/access/status",
  (req, res) => {

    const uid =
      String(
        req.body.uid || ""
      ).trim();

    const deviceId =
      String(
        req.body.deviceId || ""
      ).trim();


    const uids =
      cleanExpiredUIDs();


    const item =
      uids.find(
        x =>
          x.uid === uid
      );


    if (!item) {

      return res.json({

        success: false,

        status:
          "inactive"

      });

    }


    if (
      item.deviceId &&
      item.deviceId !== deviceId
    ) {

      return res.json({

        success: false,

        status:
          "bound_other_device"

      });

    }


    res.json({

      success: true,

      status:
        "active",

      uid:
        item.uid,

      expiresAt:
        item.expiresAt

    });

  }
);


/* ================================
   ADMIN PENDING REQUESTS
================================ */

app.get(
  "/api/admin/requests",
  requireAdmin,
  (req, res) => {

    const requests =
      readJSON(
        REQUEST_FILE,
        []
      );


    const pending =
      requests.filter(
        item =>
          item.status ===
          "pending"
      );


    res.json({

      success: true,

      requests:
        pending

    });

  }
);


/* ================================
   ADMIN ACTIVATE UID
================================ */

app.post(
  "/api/admin/activate",
  requireAdmin,
  (req, res) => {

    const uid =
      String(
        req.body.uid || ""
      ).trim();

    const hours =
      Number(
        req.body.hours
      ) || 24;


    if (!uid) {

      return res.status(400).json({

        success: false,

        message:
          "UID is required."

      });

    }


    if (
      hours !== 1 &&
      hours !== 24
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Duration must be 1 or 24 hours."

      });

    }


    let uids =
      cleanExpiredUIDs();


    const existing =
      uids.find(
        item =>
          item.uid === uid
      );


    if (existing) {

      return res.json({

        success: false,

        message:
          "UID is already active."

      });

    }


    let requests =
      readJSON(
        REQUEST_FILE,
        []
      );


    /*
      Find the member's pending request.
      The requested device gets bound
      when admin activates the UID.
    */

    const request =
      requests.find(
        item =>
          item.uid === uid &&
          item.status ===
            "pending"
      );


    const now =
      Date.now();


    const expiresAt =
      now +
      hours *
      60 *
      60 *
      1000;


    const newUID = {

      uid:

        uid,

      deviceId:

        request
          ? request.deviceId
          : null,

      activatedAt:

        now,

      expiresAt:

        expiresAt,

      durationHours:

        hours,

      boundAt:

        request
          ? now
          : null

    };


    uids.push(
      newUID
    );


    writeJSON(
      UID_FILE,
      uids
    );


    /* Mark request approved */

    if (request) {

      requests =
        requests.map(
          item => {

            if (
              item.uid === uid &&
              item.status ===
                "pending"
            ) {

              return {

                ...item,

                status:
                  "approved",

                approvedAt:
                  now

              };

            }


            return item;

          }
        );


      writeJSON(
        REQUEST_FILE,
        requests
      );

    }


    res.json({

      success: true,

      uid:

        uid,

      expiresAt:

        expiresAt,

      deviceId:

        newUID.deviceId

    });

  }
);


/* ================================
   ADMIN LOCK UID
================================ */

app.post(
  "/api/admin/lock",
  requireAdmin,
  (req, res) => {

    const uid =
      String(
        req.body.uid || ""
      ).trim();


    if (!uid) {

      return res.status(400).json({

        success: false,

        message:
          "UID is required."

      });

    }


    const uids =
      cleanExpiredUIDs();


    const filtered =
      uids.filter(
        item =>
          item.uid !== uid
      );


    writeJSON(
      UID_FILE,
      filtered
    );


    res.json({

      success: true,

      message:
        "UID locked successfully."

    });

  }
);


/* ================================
   ADMIN LOCK ALL
================================ */

app.post(
  "/api/admin/lock-all",
  requireAdmin,
  (req, res) => {

    writeJSON(
      UID_FILE,
      []
    );


    res.json({

      success: true,

      message:
        "All UID access locked."

    });

  }
);
/* ================================
   ADMIN REJECT REQUEST
================================ */

app.post(
  "/api/admin/requests/reject",
  requireAdmin,
  (req, res) => {

    const uid =
      String(
        req.body.uid || ""
      ).trim();


    if (!uid) {

      return res.status(400).json({

        success: false,

        message:
          "UID is required."

      });

    }


    let requests =
      readJSON(
        REQUEST_FILE,
        []
      );


    let changed = false;


    requests =
      requests.map(
        item => {

          if (
            item.uid === uid &&
            item.status ===
              "pending"
          ) {

            changed = true;

            return {

              ...item,

              status:
                "rejected",

              rejectedAt:
                Date.now()

            };

          }


          return item;

        }
      );


    writeJSON(
      REQUEST_FILE,
      requests
    );


    res.json({

      success:
        changed,

      message:
        changed
          ? "Request rejected."
          : "Pending request not found."

    });

  }
);


/* ================================
   LIVE HISTORY PROXY
================================ */

let historyCache =
  null;


app.get(
  "/api/history",
  async (req, res) => {

    const controller =
      new AbortController();


    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        10000
      );


    try {

      const url =
        HISTORY_URL +
        "?_t=" +
        Date.now();


      const response =
        await fetch(
          url,
          {
            method:
              "GET",

            headers: {

              "Accept":
                "application/json,text/plain,*/*",

              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

              "Referer":
                "https://draw.ar-lottery01.com/"

            },

            signal:
              controller.signal

          }
        );


      if (!response.ok) {

        throw new Error(
          "History API HTTP " +
          response.status
        );

      }


      const data =
        await response.json();


      /*
        Save the last successful
        live response.
      */

      historyCache =
        data;


      res.json(data);

    }
    catch (error) {

      console.error(
        "History proxy error:",
        error.message
      );


      /*
        If upstream is temporarily
        unavailable, return the last
        successful API response.
      */

      if (historyCache) {

        return res.json(
          historyCache
        );

      }


      res.json({

        success:
          false,

        data: {

          list: []

        },

        message:
          "Live result connection temporarily unavailable."

      });

    }
    finally {

      clearTimeout(
        timeout
      );

    }

  }
);


/* ================================
   HEALTH CHECK
================================ */

app.get(
  "/health",
  (req, res) => {

    res.status(200).json({

      status:
        "ok",

      service:
        "AMBIKA PANE AI"

    });

  }
);
/* ================================
   STATIC FRONTEND
================================ */

app.use(
  express.static(
    PUBLIC_DIR
  )
);


/* ================================
   EXPRESS 5 FALLBACK
================================ */

app.use(
  (req, res, next) => {

    if (
      req.method !== "GET" ||
      req.path.startsWith("/api/")
    ) {

      return next();

    }


    res.sendFile(
      path.join(
        PUBLIC_DIR,
        "index.html"
      )
    );

  }
);


/* ================================
   ERROR HANDLER
================================ */

app.use(
  (err, req, res, next) => {

    console.error(
      "Server error:",
      err
    );


    res.status(500).json({

      success: false,

      message:
        "Internal server error."

    });

  }
);


/* ================================
   START SERVER
================================ */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `AMBIKA PANE AI running on port ${PORT}`
    );

  }
);
