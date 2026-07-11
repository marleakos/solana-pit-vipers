// SOLANA MOG — submits a "put the shades on them" job to nano banana.
// POST { image: "data:image/jpeg;base64,..." } -> { taskId }
// Key: NANOBANANA_API_KEY env var (set on the Netlify site), or apikey.txt (local dev).

const fs = require("fs");
const path = require("path");

const API_BASE = "https://api.nanobananaapi.ai/api/v1/nanobanana";

// The shades reference must be a public URL the API can fetch: a clean product
// shot on white so the model reads the glasses clearly.
const SHADES_FALLBACK_URL =
  "https://solana-mog.netlify.app/img/glasses-ref.jpg";

function shadesUrl(event) {
  if (process.env.MOG_IMAGE_URL) return process.env.MOG_IMAGE_URL;
  const host = (event.headers && (event.headers.host || event.headers.Host)) || "";
  if (host && !/localhost|127\.0\.0\.1/.test(host)) return `https://${host}/img/glasses-ref.jpg`;
  return SHADES_FALLBACK_URL;
}

const PROMPT =
  "Put the exact wraparound Pit Viper sport sunglasses from the second image onto the face of the subject in the " +
  "first image. The shades have a single large curved shield lens with a blue-to-purple mirror finish and a black " +
  "frame. Fit them naturally over the subject's eyes, following the angle and perspective of their head, sitting " +
  "correctly on the nose and ears. Keep the subject's face, expression, species, skin/fur color, hair and identity " +
  "fully recognizable — only add the sunglasses, do not restyle the person. Recompose as a clean square profile " +
  "picture, subject centered, chest-up. Keep the vibe bold and cool. Photorealistic where the source is a photo, " +
  "matching the art style where the source is a drawing. Absolutely no text, no letters, no numbers, no watermarks, " +
  "no logos anywhere.";

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

  if (event.httpMethod !== "POST") return respond(405, { error: "POST only" });

  const apiKey = getKey();
  if (!apiKey) return respond(500, { error: "no API key configured (NANOBANANA_API_KEY)" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}
  const image = body.image;
  const imageUrl = body.imageUrl; // real hosted URL of the subject (preferred)

  let subject;
  if (imageUrl && /^https?:\/\//.test(imageUrl)) {
    subject = imageUrl;
  } else if (image && /^data:image\/(png|jpeg|jpg|webp);base64,/.test(image)) {
    if (image.length > 65000) return respond(413, { error: "image too large (max ~48KB jpeg)" });
    subject = image;
  } else {
    return respond(400, { error: "send { image: dataUrl } or { imageUrl: httpsUrl }" });
  }

  const callback = `https://${(event.headers && (event.headers.host || event.headers.Host)) || "example.com"}/`;

  for (const type of ["IMAGETOIAMGE", "IMAGETOIMAGE"]) {
    const res = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: PROMPT,
        type,
        imageUrls: [subject, shadesUrl(event)],
        numImages: 1,
        callBackUrl: callback,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.code === 200 && json.data && json.data.taskId) {
      return respond(200, { taskId: json.data.taskId });
    }
    const msg = JSON.stringify(json).slice(0, 300);
    if (/type/i.test(msg) && type === "IMAGETOIAMGE") continue;
    return respond(502, { error: `nano banana refused: ${msg}` });
  }
  return respond(502, { error: "submit failed with both type spellings" });
};
