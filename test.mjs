import fs from 'fs';
const url = "https://2m543660yi.execute-api.us-east-1.amazonaws.com/prod/apis.wattnow.io/data/v1/device/daily/electricity/us-east-1:0e1c5129-884a-4d25-9ec3-cbfc458a62f6/dn-13-11386/2026-01-01/2026-01-30";

const res = await fetch(url, { headers: { "x-api-key": "W8rQ569snBaYHkU2Qkhai4NqCaiCwUfX7mJKAKsp" } });
const text = await res.text();
fs.writeFileSync('api-response.json', text);
console.log("Status:", res.status);
console.log("Done");
