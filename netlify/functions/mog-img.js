// SOLANA PIT VIPERS — serves an uploaded image back out of Netlify Blobs.
// GET ?k=<key> -> the image bytes (so nano banana can fetch it by URL).

const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async (event) => {
  const key = (event.queryStringParameters || {}).k;
  if (!key) return { statusCode: 400, body: "k required" };

  try {
    connectLambda(event);
    const store = getStore("pv-uploads");
    const res = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!res || !res.data) return { statusCode: 404, body: "not found" };
    const ct = (res.metadata && res.metadata.contentType) || "image/jpeg";
    return {
      statusCode: 200,
      headers: { "Content-Type": ct, "Cache-Control": "public, max-age=3600" },
      body: Buffer.from(res.data).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 500, body: "read failed: " + e.message };
  }
};
