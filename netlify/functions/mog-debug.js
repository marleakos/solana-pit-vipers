// temporary diagnostic: reports whether the Netlify Blobs runtime context exists.
// returns env var NAMES only (no values) for safety.
exports.handler = async () => {
  const keys = Object.keys(process.env);
  const relevant = keys.filter((k) => /BLOB|SITE|DEPLOY|NETLIFY|AWS_LAMBDA|URL/i.test(k)).sort();
  let blobsProbe = "n/a";
  try {
    const { getStore } = require("@netlify/blobs");
    const s = getStore("pv-uploads");
    await s.set("__probe", "ok");
    blobsProbe = "AUTO OK";
  } catch (e) {
    blobsProbe = "AUTO FAIL: " + e.message.slice(0, 80);
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      node: process.version,
      hasBlobsContext: !!process.env.NETLIFY_BLOBS_CONTEXT,
      hasSiteId: !!(process.env.SITE_ID || process.env.NETLIFY_SITE_ID),
      blobsProbe,
      envNames: relevant,
    }),
  };
};
