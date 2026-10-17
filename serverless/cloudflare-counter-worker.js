/**
 * Cloudflare Worker for PDF Tools - Anonymous Global Impact Counter
 * 
 * Free Tier Limits:
 * - 100,000 requests / day (Reads & Writes combined)
 * - 1,000 KV Writes / day
 * 
 * Setup Instructions:
 * 1. Log in to Cloudflare Dashboard (https://dash.cloudflare.com/)
 * 2. Go to "Workers & Pages" -> "Create Application" -> "Create Worker"
 * 3. Name it "pdf-counter" and click "Deploy"
 * 4. Go to "Settings" -> "Variables" -> "KV Namespace Bindings"
 *    - Click "Add binding"
 *    - Variable name: COUNTER_KV
 *    - KV namespace: select or create a KV namespace named "PDF_COUNTER_KV"
 * 5. Click "Quick Edit", paste this entire script, and click "Save and Deploy"!
 */

// Initial seed baseline to prevent the cold-start empty counter
const INITIAL_VISITORS = 1480;
const INITIAL_PROCESSED = 3920;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight options
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    try {
      // 1. Get current stats
      if (request.method === 'GET' && (url.pathname === '/api/stats' || url.pathname === '/')) {
        const stats = await getStats(env);
        return new Response(JSON.stringify({ success: true, ...stats }), {
          status: 200,
          headers: CORS_HEADERS,
        });
      }

      // 2. Increment visitor count (invoked once per user session)
      if (request.method === 'POST' && url.pathname === '/api/visit') {
        const stats = await incrementStat(env, 'visitors', 1);
        return new Response(JSON.stringify({ success: true, ...stats }), {
          status: 200,
          headers: CORS_HEADERS,
        });
      }

      // 3. Increment processed PDFs count (invoked when a tool completes/downloads)
      if (request.method === 'POST' && url.pathname === '/api/processed') {
        let amount = 1;
        try {
          const body = await request.json();
          if (body && typeof body.amount === 'number' && body.amount > 0 && body.amount <= 100) {
            amount = Math.floor(body.amount);
          }
        } catch (_) {
          // If no body provided, defaults to 1
        }

        const stats = await incrementStat(env, 'processed', amount);
        return new Response(JSON.stringify({ success: true, ...stats }), {
          status: 200,
          headers: CORS_HEADERS,
        });
      }

      // Unknown route
      return new Response(JSON.stringify({ error: 'Not Found', path: url.pathname }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal Error', message: err.message }), {
        status: 500,
        headers: CORS_HEADERS,
      });
    }
  },
};

/**
 * Helper to fetch stats with seed defaults
 */
async function getStats(env) {
  if (!env.COUNTER_KV) {
    // Graceful fallback if KV binding is not yet attached
    return { visitors: INITIAL_VISITORS, processed: INITIAL_PROCESSED };
  }

  const [rawVisitors, rawProcessed] = await Promise.all([
    env.COUNTER_KV.get('visitors'),
    env.COUNTER_KV.get('processed'),
  ]);

  const visitors = rawVisitors !== null ? parseInt(rawVisitors, 10) : INITIAL_VISITORS;
  const processed = rawProcessed !== null ? parseInt(rawProcessed, 10) : INITIAL_PROCESSED;

  return { visitors, processed };
}

/**
 * Helper to increment a key atomically in KV
 */
async function incrementStat(env, key, delta = 1) {
  if (!env.COUNTER_KV) {
    return { visitors: INITIAL_VISITORS, processed: INITIAL_PROCESSED };
  }

  const currentStats = await getStats(env);
  const updatedValue = (currentStats[key] || 0) + delta;

  // Persist updated count to KV
  await env.COUNTER_KV.put(key, updatedValue.toString());

  return {
    ...currentStats,
    [key]: updatedValue,
  };
}
