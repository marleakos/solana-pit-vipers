// SOLANA PIT VIPERS — hosts a user upload at a real public URL.
// nano banana's API needs a real image URL (not a base64 data URL), so we stash
// the upload in Netlify Blobs and hand back a URL served by mog-img.
// POST { image: "data:image/jpeg;base64,..." } -> { url }

const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async (event) => {
  const respond = (code, body) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (event.httpMethod !== "POST") return respond(405, { error: "POST only" });

  // Lambda-compat functions get the Blobs context from the event, not an env var.
  try { connectLambda(event); } catch (e) {}

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}
  const image = body.image;
  const m = typeof image === "string" && image.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!m) return respond(400, { error: "send { image: dataUrl }" });

  const contentType = m[1];
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 6 * 1024 * 1024) return respond(413, { error: "image too large (max 6MB)" });

  try {
    const store = getStore("pv-uploads");
    const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    await store.set(key, buf, { metadata: { contentType } });
    const host = (event.headers && (event.headers.host || event.headers.Host)) || "";
    const url = `https://${host}/.netlify/functions/mog-img?k=${key}`;
    return respond(200, { url });
  } catch (e) {
    return respond(500, { error: "upload store failed: " + e.message });
  }
};
