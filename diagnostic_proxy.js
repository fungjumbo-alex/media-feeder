import fetch from 'node-fetch';

async function testProxy() {
    const targetUrl = 'https://inv.nadeko.net/api/v1/captions/48TkJ72ys2s';
    console.log(`Testing fetch to: ${targetUrl}`);

    try {
        const fetchOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            },
            timeout: 10000
        };

        const response = await fetch(targetUrl, fetchOptions);
        console.log(`Status: ${response.status} ${response.statusText}`);

        const text = await response.text();
        console.log(`Response length: ${text.length}`);
        console.log(`Response snippet: ${text.substring(0, 200)}`);

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

testProxy();
