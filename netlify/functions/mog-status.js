// SOLANA MOG — polls a shades job.
// GET ?taskId=... -> { status: "pending" | "done" | "failed", url?, error? }

const fs = require("fs");
const path = require("path");

const API_BASE = "https://api.nanobananaapi.ai/api/v1/nanobanana";

function getKey() {
  if (process.env.NANOBANANA_API_KEY) return process.env.NANOBANANA_API_KEY.trim();
  for (const p of [
    path.join(process.cwd(), "apikey.txt"),
    path.join(__dirname, "..", "..", "..", "apikey.txt"),
    path.join(__dirname, "..", "..", "..", "..", "hood", "apikey.txt"),
  ]) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim(); } catch (e) {}
  }
  return "";
}

exports.handler = async (event) => {
  const respond = (code, body) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const apiKey = getKey();
  if (!apiKey) return respond(500, { error: "no API key configured (NANOBANANA_API_KEY)" });

  const taskId = (event.queryStringParameters || {}).taskId;
  if (!taskId) return respond(400, { error: "taskId required" });

  const res = await fetch(`${API_BASE}/record-info?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = await res.json().catch(() => ({}));
  const d = (json && json.data) || {};

  if (d.successFlag === 1) {
    const url = (d.response && (d.response.resultImageUrl || d.response.originImageUrl)) || null;
    if (!url) return respond(200, { status: "failed", error: "succeeded but no image URL" });
    return respond(200, { status: "done", url });
  }
  if (d.successFlag === 2 || d.successFlag === 3) {
    return respond(200, { status: "failed", error: d.errorMessage || `flag ${d.successFlag}` });
  }
  return respond(200, { status: "pending" });
};
