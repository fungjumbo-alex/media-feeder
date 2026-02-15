import fetch from 'node-fetch';

const INVIDIOUS_INSTANCES = [
    'https://yewtu.be',
    'https://invidious.projectsegfau.lt',
    'https://invidious.privacydev.net',
    'https://inv.vern.cc',
    'https://iv.ggtyler.dev',
    'https://invidious.lunar.icu',
    'https://invidious.flokinet.to',
    'https://invidious.perennialte.ch',
    'https://inv.tux.nu',
    'https://invidious.io.lol',
    'https://iv.n8ms.com',
];

const VIDEO_ID = 'jNQXAC9IVRw'; // "Me at the zoo"

async function checkInstances() {
    console.log(`Checking ${INVIDIOUS_INSTANCES.length} instances for video ${VIDEO_ID}...`);

    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const url = `${instance}/api/v1/captions/${VIDEO_ID}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 5000
            });

            if (response.ok) {
                const data = await response.json();
                const captions = Array.isArray(data) ? data : data.captions || [];
                console.log(`[OK] ${instance}: Found ${captions.length} captions`);
                if (captions.length > 0) {
                    const en = captions.find(c => c.languageCode === 'en' || c.language_code === 'en') || captions[0];
                    const captionUrl = en.url.startsWith('http') ? en.url : `${instance}${en.url}`;
                    const capRes = await fetch(captionUrl, { timeout: 5000 });
                    if (capRes.ok) {
                        const text = await capRes.text();
                        console.log(`     - Caption Download OK: ${text.length} bytes`);
                    } else {
                        console.log(`     - Caption Download FAILED: ${capRes.status}`);
                    }
                }
            } else {
                console.log(`[FAIL] ${instance}: Status ${response.status}`);
            }
        } catch (e) {
            console.log(`[ERROR] ${instance}: ${e.message}`);
        }
    }
}

checkInstances();
