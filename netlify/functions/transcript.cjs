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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    ...(origin ? { 'Vary': 'Origin' } : {}),
    ...extra,
  };
}

// ── Rate Limiting ────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function rateLimitKey(event) {
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

// ── Helpers ──────────────────────────────────────────────────────────────────
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

async function fetchUrl(url, extraHeaders = {}) {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

    const response = await fetch(url, {
        headers: {
            'User-Agent': ua,
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Cache-Control': 'max-age=0',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            ...(isYouTube && {
                'Cookie': YT_COOKIE,
            }),
            ...extraHeaders
        }
    });

    if (!response.ok && response.status !== 429) {
        throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    if (response.status === 429) {
        throw new Error('Bot detection triggered (429)');
    }

    return await response.text();
}

// ── Handler ──────────────────────────────────────────────────────────────────
// ── Request Body Size Limit (1MB) ────────────────────────────────────────
const MAX_BODY_SIZE = 1_048_576;

exports.handler = async (event, context) => {
  if (event.body && event.body.length > MAX_BODY_SIZE) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Request body too large (max 1MB)' }) };
  }
    const requestHeaders = event.headers || {};

    // OPTIONS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders(requestHeaders), body: '' };
    }

    const headers = corsHeaders(requestHeaders);

    // Rate limiting
    const ip = rateLimitKey(event);
    if (!checkRateLimit(ip)) {
        return {
            statusCode: 429,
            headers,
            body: JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
        };
    }

    try {
        const { url } = JSON.parse(event.body);

        // Safety check: Don't try to scrape Invidious URLs as YouTube
        if (url.includes('/api/v1/') || url.includes('inv.') || url.includes('invidious.')) {
            throw new Error('This endpoint is for direct YouTube scraping only. Use the proxy endpoint for Invidious URLs.');
        }

        const videoIdMatch = url.match(/(?:v=|v\/|embed\/|shorts\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!videoId) throw new Error('Invalid YouTube URL or Video ID');

        console.log(`[Backend] Scraping transcript for video: ${videoId}`);
        const html = await fetchUrl(`https://www.youtube.com/watch?v=${videoId}`);

        // Pattern 1: captions property
        let captionsData = null;
        const patterns = [
            /"captions":\s*({.*?}),\s*"videoDetails"/,
            /"captions":\s*({.*?}),\s*"annotations"/,
            /ytInitialPlayerResponse\s*=\s*({.*?});/
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                try {
                    const parsed = JSON.parse(match[1]);
                    captionsData = parsed.captions || parsed;
                    if (captionsData && captionsData.playerCaptionsTracklistRenderer) break;
                } catch (e) { }
            }
        }

        if (!captionsData || !captionsData.playerCaptionsTracklistRenderer) {
            // Diagnostic check: is it a bot block?
            if (html.includes('id="captcha-form"') || html.includes('recaptcha')) {
                throw new Error('Bot detection triggered');
            }
            if (html.includes('consent.youtube.com')) {
                throw new Error('Consent page redirect');
            }

            throw new Error('Captions data not found in page');
        }

        const tracklist = captionsData.playerCaptionsTracklistRenderer;
        const tracks = tracklist.captionTracks;
        if (!tracks || tracks.length === 0) throw new Error('No subtitle tracks available');

        // Prefer English, then English (auto), then first available
        const track =
            tracks.find(t => t.languageCode === 'en' && !t.kind) ||
            tracks.find(t => t.languageCode === 'en') ||
            tracks[0];

        if (!track || !track.baseUrl) throw new Error('Selected track has no base URL');

        const transcriptJson = await fetchUrl(track.baseUrl + '&fmt=json3');

        let data;
        try {
            data = JSON.parse(transcriptJson);
        } catch (e) {
            if (transcriptJson.includes('id="captcha-form"') || transcriptJson.includes('recaptcha')) {
                throw new Error('Bot detection triggered');
            }
            throw new Error('Invalid transcript format received');
        }

        if (!data.events) throw new Error('Transcript format unknown or empty');

        const snippets = data.events
            .filter(e => e.segs)
            .map(e => ({
                start: e.tStartMs / 1000,
                duration: (e.dDurationMs || 0) / 1000,
                text: e.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim()
            }))
            .filter(s => s.text.length > 0);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(snippets)
        };

    } catch (e) {
        // Log full details server-side only (include message for debugging)
        console.error(`[Backend] Error for video request: ${e.message}`);

        const isBotBlock = e.message.includes('Bot detection') || e.message.includes('blocking');
        const statusCode = isBotBlock ? 429 : 500;

        // Sanitized error response — no URLs, HTML snippets, or DNS codes leaked
        return {
            statusCode: statusCode,
            headers,
            body: JSON.stringify({
                error: isBotBlock
                    ? 'External service is temporarily blocking requests'
                    : 'Transcript request failed',
                code: isBotBlock ? 'IP_BLOCKED' : 'GENERIC_ERROR'
            })
        };
    }
};
