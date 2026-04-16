import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());

// --- WattNow API Configuration ---
const BASE = "https://2m543660yi.execute-api.us-east-1.amazonaws.com/prod/apis.wattnow.io";
const USER_ID = "us-east-1:0e1c5129-884a-4d25-9ec3-cbfc458a62f6";
const API_KEY = "W8rQ569snBaYHkU2Qkhai4NqCaiCwUfX7mJKAKsp";

const INTERVALS = new Set(["daily", "hourly"]);
const VALID_TYPES = new Set(["electricity", "water"]);
const DN_RE = /^dn-\d{2}-\d{5}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Shared handler for WattNow API proxy requests.
 * Builds the upstream URL and forwards the response.
 */
async function handleDeviceProxy(req, res, deviceType) {
  const { interval, dn, start, end } = req.params;

  if (!INTERVALS.has(interval)) {
    return res.status(400).json({ error: "Invalid interval" });
  }
  if (!DN_RE.test(dn)) {
    return res.status(400).json({ error: "Invalid device code" });
  }
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return res.status(400).json({ error: "Invalid date format, expected YYYY-MM-DD" });
  }

  // Correct URL format: /data/v1/device/{interval}/{deviceType}/{userId}/{deviceId}/{startDate}/{endDate}
  const url = `${BASE}/data/v1/device/${interval}/${deviceType}/${USER_ID}/${dn}/${start}/${end}`;
  
  try {
    const response = await fetch(url, { 
      headers: { 
        "accept": "application/json",
        "x-api-key": API_KEY 
      } 
    });
    
    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text();
    const isJson = contentType.includes("application/json");

    if (isJson) {
      try {
        const data = JSON.parse(rawBody);
        
        // Log first item keys to help frontend debugging if needed (server-side only)
        if (data && Array.isArray(data) && data.length > 0) {
          console.log(`[WattNow API] ${dn} (${deviceType}) - Found ${data.length} items. Fields:`, Object.keys(data[0]));
        } else if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
           console.log(`[WattNow API] ${dn} (${deviceType}, nested) - Found ${data.data.length} items. Fields:`, Object.keys(data.data[0]));
        }

        res.status(response.status).json(data);
      } catch (e) {
        res.status(response.status).send(rawBody);
      }
    } else {
      res.status(response.status).send(rawBody);
    }
  } catch (err) {
    res.status(500).json({ error: err.message, url });
  }
}

// ── Backward-compatible route (electricity default) ──────────────────────
app.get("/api/device/:interval/:dn/:start/:end", (req, res) => {
  return handleDeviceProxy(req, res, "electricity");
});

// ── New route with dynamic device type ───────────────────────────────────
app.get("/api/device/:type/:interval/:dn/:start/:end", (req, res) => {
  const { type } = req.params;

  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ error: `Invalid device type '${type}'. Must be one of: ${[...VALID_TYPES].join(", ")}` });
  }

  return handleDeviceProxy(req, res, type);
});

app.listen(3001, () => {
  console.log("[STLR Proxy] Running on http://localhost:3001");
  console.log(`[STLR Proxy] Targeting User: ${USER_ID}`);
  console.log(`[STLR Proxy] Supported device types: ${[...VALID_TYPES].join(", ")}`);
});
