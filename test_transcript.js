
import fetch from 'node-fetch';

const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://yewtu.be',
    'https://invidious.nerdvpn.de',
    'https://invidious.f5.si',
    'https://inv.perditum.com',
    'https://invidious.drgns.space',
    'https://invidious.projectsegfau.lt',
];

const VIDEO_ID = 'jNQXAC9IVRw'; // "Me at the zoo"

async function testFetch() {
    console.log('Testing transcript fetch via Proxy...');

    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            console.log(`Trying ${instance} via AllOrigins...`);
            const targetUrl = `${instance}/api/v1/captions/${VIDEO_ID}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

            const response = await fetch(proxyUrl);
            if (response.ok) {
                const proxyData = await response.json();
                if (proxyData.contents) {
                    try {
                        const data = JSON.parse(proxyData.contents);
                        console.log(`SUCCESS: Fetched captions list from ${instance}`);
                        console.log('Captions data structure:', JSON.stringify(data, null, 2));

                        if (data.captions && data.captions.length > 0) {
                            const enCaption = data.captions.find(c => c.language_code === 'en') || data.captions[0];
                            const captionFileUrl = `${instance}${enCaption.url}`;
                            const proxyCaptionUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(captionFileUrl)}`;

                            console.log(`Fetching caption content from ${captionFileUrl} via proxy...`);
                            const capRes = await fetch(proxyCaptionUrl);
                            const capProxyData = await capRes.json();
                            const capText = capProxyData.contents;

                            if (capText.startsWith('data:')) {
                                const base64 = capText.split(',')[1];
                                const decoded = Buffer.from(base64, 'base64').toString('utf-8');
                                console.log('Decoded content preview:', decoded.substring(0, 200));
                            } else {
                                console.log('Caption content preview (first 200 chars):', capText.substring(0, 200));
                            }
                            return;
                        }
                    } catch (e) {
                        console.log(`Parsing inner content failed: ${e.message}. Content start: ${proxyData.contents.substring(0, 100)}`);
                    }
                } else {
                    console.log(`FAILED: AllOrigins returned no contents. Status: ${proxyData.status?.http_code}`);
                }
            } else {
                console.log(`FAILED: AllOrigins proxy request failed: ${response.status}`);
            }
        } catch (e) {
            console.log(`ERROR: ${instance} - ${e.message}`);
        }
    }
    console.log('ALL FAILED');
}

testFetch();
