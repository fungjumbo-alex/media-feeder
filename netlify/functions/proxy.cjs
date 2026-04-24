// ── SSRF Protection ──────────────────────────────────────────────────────────
// Block requests to private/internal IP ranges and cloud metadata endpoints.
function isPrivateIP(hostname) {
  // IPv4
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(p => !isNaN(p))) {
    const [a, b] = parts;
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 127) return true;                       // 127.0.0.0/8
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 (link-local + metadata)
    if (a === 0) return true;                         // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true;// 100.64.0.0/10 (CGN)
  }
  // IPv6 & special names
  const lower = hostname.toLowerCase();
  if (lower === '::1' || lower === 'localhost') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
  if (lower.startsWith('fe80')) return true;                          // link-local
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.replace('::ffff:', '');
    if (isPrivateIP(mapped)) return true;
  }
  return false;
}

// ── CORS Helpers ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://media-feeder.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getAllowedOrigin(requestHeaders) {
  const origin = requestHeaders.origin || requestHeaders.Origin || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : '';
}

function corsHeaders(requestHeaders, extra = {}) {
  const origin = getAllowedOrigin(requestHeaders);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, x-proxy-accept, x-proxy-fetch-dest, x-proxy-fetch-mode, x-proxy-fetch-site, x-proxy-referer, x-proxy-origin, x-proxy-no-cookies',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    ...(origin ? { 'Vary': 'Origin' } : {}),
    ...extra,
  };
}

// ── Rate Limiting ────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function rateLimitKey(event) {
  // Netlify provides client IP in headers
  return event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    entry = { start: now, count: 1 };
    rateLimitMap.set(ip, entry);
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

// Periodically prune stale entries (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap) {
    if (now - v.start > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(k);
  }
}, 300_000);

// ── Hardcoded Cookie Fallbacks ───────────────────────────────────────────────
// These should be overridden via Netlify environment variables for production.
// Set YT_CONSENT_COOKIE, YT_SOCS_COOKIE, YT_VISITOR_COOKIE in the Netlify UI.
const YT_COOKIE = [
  process.env.YT_CONSENT_COOKIE  || 'PENDING+987',
  process.env.YT_SOCS_COOKIE     || 'CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg',
  process.env.YT_VISITOR_COOKIE  || 'ztLpX-Pq_2Y',
].map((v, i) => {
  const names = ['CONSENT', 'SOCS', 'VISITOR_INFO1_LIVE'];
  return `${names[i]}=${v}`;
}).join('; ');

// ── Handler ──────────────────────────────────────────────────────────────────
exports.handler = async function (event, context) {
  const requestHeaders = event.headers || {};

  // OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(requestHeaders), body: '' };
  }

  // Rate limiting
  const ip = rateLimitKey(event);
  if (!checkRateLimit(ip)) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(requestHeaders) },
      body: JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
    };
  }

  const params = event.queryStringParameters;
  const targetUrl = params.url;

  if (!targetUrl) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(requestHeaders) },
      body: JSON.stringify({ error: 'Missing url query parameter' }),
    };
  }

  // ── SSRF Validation ──────────────────────────────────────────────────────
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(requestHeaders) },
      body: JSON.stringify({ error: 'Invalid URL' }),
    };
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(requestHeaders) },
      body: JSON.stringify({ error: 'Unsupported protocol' }),
    };
  }

  const hostname = parsedUrl.hostname;

  // Block private IPs and cloud metadata endpoint
  if (isPrivateIP(hostname)) {
    console.warn(`[Proxy] Blocked private/internal IP request: ${hostname}`);
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(requestHeaders) },
      body: JSON.stringify({ error: 'Request to internal network is not allowed' }),
    };
  }

  try {
    const isYouTube = hostname.endsWith('youtube.com') || hostname === 'youtu.be' || hostname.endsWith('googlevideo.com');

    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': requestHeaders['x-proxy-accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': requestHeaders['x-proxy-fetch-dest'] || 'document',
      'Sec-Fetch-Mode': requestHeaders['x-proxy-fetch-mode'] || 'navigate',
      'Sec-Fetch-Site': requestHeaders['x-proxy-fetch-site'] || 'none',
      'Cache-Control': 'max-age=0',
      ...(isYouTube && {
        'Referer': requestHeaders['x-proxy-referer'] || 'https://www.google.com/',
        'Origin': requestHeaders['x-proxy-origin'] || 'https://www.youtube.com',
        'Cookie': YT_COOKIE,
      }),
    };

    // Use AbortController with timeout to avoid Netlify function timeout (10s default)
    // which would return a generic 500 with no useful error info.
    const FETCH_TIMEOUT_MS = 8000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(targetUrl, {
        headers: fetchHeaders,
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        console.warn(`[Proxy] Fetch timed out after ${FETCH_TIMEOUT_MS}ms for ${hostname}`);
        return {
          statusCode: 504,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(requestHeaders) },
          body: JSON.stringify({ error: 'Target server timed out', code: 'TIMEOUT' }),
        };
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    console.log(`[Proxy] Response status: ${response.status} for ${hostname}`);

    const contentType = response.headers.get('content-type') || '';
    const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml');

    let body;
    let isBase64Encoded = false;

    if (isText) {
      body = await response.text();
    } else {
      const buffer = await response.arrayBuffer();
      body = Buffer.from(buffer).toString('base64');
      isBase64Encoded = true;
    }

    return {
      statusCode: response.status,
      headers: {
        ...corsHeaders(requestHeaders, { 'Content-Type': contentType }),
      },
      body: body,
      isBase64Encoded: isBase64Encoded
    };

  } catch (error) {
    const isDnsError = error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN';
    const isTimeout = error.code === 'ETIMEDOUT' || error.message?.includes('timeout') || error.code === 'ECONNRESET';

    // Log full details server-side only
    console.error('[Proxy] Global error:', {
      message: error.message,
      code: error.code,
      hostname: hostname
    });

    // Sanitized generic error returned to client
    return {
      statusCode: isDnsError ? 502 : isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(requestHeaders) },
      body: JSON.stringify({
        error: 'Proxy request failed',
        code: isDnsError ? 'DNS_ERROR' : isTimeout ? 'TIMEOUT' : 'PROXY_ERROR',
      }),
    };
  }
};
