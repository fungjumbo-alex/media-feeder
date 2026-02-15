import fetch from 'node-fetch';

const PROXIES = [
    {
        name: 'AllOrigins',
        buildUrl: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    },
    {
        name: 'corsproxy.io',
        buildUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    }
];

const VIDEO_ID = 'jNQXAC9IVRw'; // "Me at the zoo"

async function testScrape() {
    console.log(`Testing direct scrape for video ${VIDEO_ID}...`);

    for (const proxy of PROXIES) {
        try {
            console.log(`Trying proxy ${proxy.name}...`);
            const watchUrl = `https://www.youtube.com/watch?v=${VIDEO_ID}&ucbcb=1`;
            const proxyUrl = proxy.buildUrl(watchUrl);

            const res = await fetch(proxyUrl);
            if (!res.ok) {
                console.log(`[FAIL] ${proxy.name}: Status ${res.status}`);
                continue;
            }

            const data = await res.json();
            const html = typeof data.contents === 'string' ? data.contents : '';

            if (html.includes('ytInitialPlayerResponse')) {
                console.log(`[SUCCESS] ${proxy.name}: Found ytInitialPlayerResponse in HTML`);
                const regex = /ytInitialPlayerResponse\s*=\s*({.+?});/s;
                const match = html.match(regex);
                if (match) {
                    const playerResponse = JSON.parse(match[1]);
                    const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                    if (captions && captions.length > 0) {
                        console.log(`[OK] Found ${captions.length} caption tracks`);
                        captions.forEach(c => console.log(` - ${c.label.simpleText}: ${c.languageCode}`));
                    } else {
                        console.log(`[FAIL] No caption tracks found in playerResponse`);
                    }
                } else {
                    console.log(`[FAIL] Failed to parse ytInitialPlayerResponse JSON`);
                }
            } else {
                console.log(`[FAIL] ${proxy.name}: ytInitialPlayerResponse not found in HTML (Length: ${html.length})`);
                if (html.includes('consent.google.com') || html.includes('before you continue to youtube')) {
                    console.log(`     - Reason: YouTube Consent Page block`);
                }
            }
        } catch (e) {
            console.log(`[ERROR] ${proxy.name}: ${e.message}`);
        }
    }
}

testScrape();
