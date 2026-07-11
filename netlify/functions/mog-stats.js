// SOLANA MOG — live on-chain + market data for a token.
// GET ?mint=<SPL mint> -> { onchain:{...}, market:{...} }
// Uses Helius RPC (key in HELIUS_KEY env) for supply/holders/top-holders,
// and Dexscreener (public) for USD price / market cap / liquidity / volume.

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// tiny warm-instance cache so refreshes don't hammer the RPC
const cache = {};
const TTL = 20000;

function heliusUrl() {
  const key = (process.env.HELIUS_KEY || "").trim();
  if (key) return `https://mainnet.helius-rpc.com/?api-key=${key}`;
  if (process.env.HELIUS_RPC) return process.env.HELIUS_RPC.trim();
  return "";
}

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result;
}

// count unique holders (owners with a non-zero balance) via Helius DAS getTokenAccounts.
// paginates; caps to keep the function fast on very large tokens.
async function holderCount(url, mint) {
  const owners = new Set();
  const LIMIT = 1000, MAXPAGES = 12;
  let page = 1, capped = false;
  while (page <= MAXPAGES) {
    const res = await rpc(url, "getTokenAccounts", {
      mint, page, limit: LIMIT, options: { showZeroBalance: false },
    });
    const accts = (res && res.token_accounts) || [];
    if (!accts.length) break;
    for (const a of accts) owners.add(a.owner || a.address);
    if (accts.length < LIMIT) break;
    page++;
    if (page > MAXPAGES) capped = true;
  }
  return { count: owners.size, capped };
}

async function marketData(mint) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  const j = await res.json();
  const pairs = (j && j.pairs) || [];
  if (!pairs.length) return null;
  // pick the deepest-liquidity pair
  pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
  const p = pairs[0];
  return {
    priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
    change24: p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null,
    marketCap: p.marketCap != null ? Number(p.marketCap) : (p.fdv != null ? Number(p.fdv) : null),
    fdv: p.fdv != null ? Number(p.fdv) : null,
    liquidity: p.liquidity && p.liquidity.usd != null ? Number(p.liquidity.usd) : null,
    volume24: p.volume && p.volume.h24 != null ? Number(p.volume.h24) : null,
    dexId: p.dexId || null,
    pairUrl: p.url || null,
    symbol: (p.baseToken && p.baseToken.symbol) || null,
    name: (p.baseToken && p.baseToken.name) || null,
  };
}

exports.handler = async (event) => {
  const respond = (code, body) => ({
    statusCode: code,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=15" },
    body: JSON.stringify(body),
  });

  const mint = ((event.queryStringParameters || {}).mint || "").trim();
  if (!B58.test(mint)) return respond(400, { error: "valid ?mint= required" });

  if (cache[mint] && Date.now() - cache[mint].t < TTL) return respond(200, cache[mint].d);

  const url = heliusUrl();
  if (!url) return respond(500, { error: "no HELIUS_KEY configured" });

  const out = { mint, onchain: {}, market: null, errors: {} };

  // run everything in parallel, tolerate partial failure
  const tasks = [
    rpc(url, "getTokenSupply", [mint])
      .then((r) => { const v = r.value; out.onchain.supply = v.uiAmount; out.onchain.decimals = v.decimals; })
      .catch((e) => { out.errors.supply = e.message; }),
    rpc(url, "getTokenLargestAccounts", [mint])
      .then((r) => { out.onchain.largest = (r.value || []).map((a) => ({ amount: a.uiAmount })); })
      .catch((e) => { out.errors.largest = e.message; }),
    holderCount(url, mint)
      .then((h) => { out.onchain.holders = h.count; out.onchain.holdersCapped = h.capped; })
      .catch((e) => { out.errors.holders = e.message; }),
    marketData(mint)
      .then((m) => { out.market = m; })
      .catch((e) => { out.errors.market = e.message; }),
  ];
  await Promise.all(tasks);

  // top holder percentages (excluding obvious LP if we can't tell, just show raw)
  if (out.onchain.largest && out.onchain.supply) {
    const sup = out.onchain.supply || 1;
    out.onchain.top = out.onchain.largest.slice(0, 8).map((a) => +((a.amount / sup) * 100).toFixed(2));
    delete out.onchain.largest;
  }

  cache[mint] = { t: Date.now(), d: out };
  return respond(200, out);
};
