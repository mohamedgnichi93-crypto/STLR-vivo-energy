const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const API_KEY = "W8rQ569snBaYHkU2Qkhai4NqCaiCwUfX7mJKAKsp";
const BASE = "https://2m543660yi.execute-api.us-east-1.amazonaws.com/prod/apis.wattnow.io/data/v1/device";
const POOL_ID = "us-east-1:0e1c5129-884a-4d25-9ec3-cbfc458a62f6";

app.get("/api/device/:interval/:dn/:start/:end", async (req, res) => {
  const { interval, dn, start, end } = req.params;
  const url = `${BASE}/${interval}/electricity/${POOL_ID}/${dn}/${start}/${end}`;
  try {
    const response = await fetch(url, { headers: { "x-api-key": API_KEY } });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("Proxy running on http://localhost:3001"));
