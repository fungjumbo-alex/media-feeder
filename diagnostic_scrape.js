
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function testInvidious(instance, videoId) {
    const url = `${instance}/api/v1/captions/${videoId}`;
    const proxyBase = `http://localhost:5173/api/proxy?url=`;

    console.log(`\n--- Testing Invidious: ${instance} ---`);
    try {
        const res = await fetch(proxyBase + encodeURIComponent(url));
        const body = await res.text();
        console.log(`Status: ${res.status}, Length: ${body.length}`);
        if (body.includes('[') || body.includes('{')) {
            const data = JSON.parse(body);
            const caps = Array.isArray(data) ? data : data.captions || [];
            console.log(`Found ${caps.length} captions.`);
        } else {
            console.log(`Body Snippet: ${body.substring(0, 100)}`);
        }
    } catch (e) {
        console.log(`Failed: ${e.message}`);
    }
}

(async () => {
    const videoId = 'he5dh4d8I2Q';
    await testInvidious('https://inv.nadeko.net', videoId);
    await testInvidious('https://iv.ggtyler.dev', videoId);
    await testInvidious('https://yewtu.be', videoId);
    await testInvidious('https://iv.melmac.space', videoId);
})();
