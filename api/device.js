const BASE = "https://2m543660yi.execute-api.us-east-1.amazonaws.com/prod/apis.wattnow.io";
const USER_ID = "us-east-1:0e1c5129-884a-4d25-9ec3-cbfc458a62f6";
const API_KEY = "W8rQ569snBaYHkU2Qkhai4NqCaiCwUfX7mJKAKsp";

export default async function handler(req, res) {
  const parts = req.url.replace(/^\/api\/device\/?/, "").split("/");
  
  let interval, deviceType, dn, start, end;
  
  if (parts.length === 4) {
    [interval, dn, start, end] = parts;
    deviceType = "electricity";
  } else if (parts.length === 5) {
    [deviceType, interval, dn, start, end] = parts;
  } else {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  const url = `${BASE}/data/v1/device/${interval}/${deviceType}/${USER_ID}/${dn}/${start}/${end}`;

  try {
    const response = await fetch(url, {
      headers: {
        "accept": "application/json",
        "x-api-key": API_KEY
      }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
