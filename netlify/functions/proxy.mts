import type { Context, Config } from '@netlify/functions';

export default async (req: Request, context: Context) => {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response('Missing url query parameter', { status: 400 });
    }

    try {
        // Add browser-like headers to avoid being blocked
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Referer': 'https://www.youtube.com/',
            'Origin': 'https://www.youtube.com',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
        };

        const response = await fetch(targetUrl, {
            headers,
        });

        // Create a new response with CORS headers
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', 'Content-Type');

        // Remove problematic headers
        const restrictedHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];
        restrictedHeaders.forEach(header => newHeaders.delete(header));

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        });
    } catch (error) {
        console.error('Proxy error:', error);
        return new Response(`Proxy error: ${String(error)}`, { status: 500 });
    }
};

export const config: Config = {
    path: '/.netlify/functions/proxy',
};
