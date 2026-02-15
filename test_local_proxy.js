import fetch from 'node-fetch';

const LOCAL_PROXY = 'http://localhost:5173/api/proxy?url=';
const VIDEO_ID = 'jNQXAC9IVRw';

async function testLocalProxy() {
    const targetUrl = `https://www.youtube.com/watch?v=${VIDEO_ID}&ucbcb=1`;
    const proxyUrl = LOCAL_PROXY + encodeURIComponent(targetUrl);

    console.log(`Testing local proxy: ${proxyUrl}`);
    try {
        const res = await fetch(proxyUrl);
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Length: ${text.length}`);

        if (text.includes('ytInitialPlayerResponse')) {
            console.log('SUCCESS: Found ytInitialPlayerResponse');
        } else if (text.includes('consent.google.com') || text.includes('before you continue to youtube')) {
            console.log('FAIL: Blocked by YouTube Consent Page');
            // Try to see if we can extract anything from the consent page or if we can bypass it
        } else {
            console.log('FAIL: Unknown response');
            console.log(`Snippet: ${text.substring(0, 500)}`);
        }
    } catch (e) {
        console.log(`ERROR: ${e.message}`);
    }
}

testLocalProxy();
