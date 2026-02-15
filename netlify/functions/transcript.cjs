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
                'Cookie': 'CONSENT=YES+yt.20250101-00-p0.en+FX+123; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; VISITOR_INFO1_LIVE=ztLpX-Pq_2Y;',
            }),
            ...extraHeaders
        }
    });

    if (!response.ok && response.status !== 429) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    if (response.status === 429) {
        throw new Error('Bot detection triggered (429). YouTube is blocking this server.');
    }

    return await response.text();
}

exports.handler = async function (event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    try {
        const { url } = JSON.parse(event.body);

        // Safety check: Don't try to scrape Invidious URLs as YouTube
        if (url.includes('/api/v1/') || url.includes('inv.') || url.includes('invidious.')) {
            throw new Error('This endpoint is for direct YouTube scraping only. Use the proxy endpoint for Invidious URLs.');
        }

        // Broaden Regex to handle shorts and unconventional YouTube URLs
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
                    // If it's the full ytInitialPlayerResponse, extract captions from it
                    captionsData = parsed.captions || parsed;
                    if (captionsData && captionsData.playerCaptionsTracklistRenderer) break;
                } catch (e) { }
            }
        }

        if (!captionsData || !captionsData.playerCaptionsTracklistRenderer) {
            // Diagnostic check: is it a bot block?
            if (html.includes('id="captcha-form"') || html.includes('recaptcha')) {
                throw new Error('Bot detection triggered (CAPTCHA). YouTube is blocking this server.');
            }
            if (html.includes('consent.youtube.com')) {
                throw new Error('Redirected to consent page. YouTube is blocking this server.');
            }

            const snippet = html.substring(0, 1000).replace(/\s+/g, ' ');
            throw new Error(`Captions data not found in page. HTML Snippet: ${snippet}`);
        }

        const tracklist = captionsData.playerCaptionsTracklistRenderer;
        const tracks = tracklist.captionTracks;
        if (!tracks || tracks.length === 0) throw new Error('Cations allowed but no tracks available (Check if video has subtitles)');

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
            // If it's not JSON, it's likely a block/redirect page
            if (transcriptJson.includes('id="captcha-form"') || transcriptJson.includes('recaptcha')) {
                throw new Error('Bot detection triggered while fetching transcript segments.');
            }
            const snippet = transcriptJson.substring(0, 500).replace(/\s+/g, ' ');
            throw new Error(`YouTube returned invalid transcript format (Not JSON). Snippet: ${snippet}`);
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
        console.error(`[Backend] Error for ${event.body}: ${e.message}`);

        // Use 429 for bot detection to signal to frontend that this IP is compromised
        const isBotBlock = e.message.includes('Bot detection') || e.message.includes('blocking this server');
        const statusCode = isBotBlock ? 429 : 500;

        return {
            statusCode: statusCode,
            headers,
            body: JSON.stringify({
                error: e.message,
                code: isBotBlock ? 'IP_BLOCKED' : 'GENERIC_ERROR'
            })
        };
    }
};
