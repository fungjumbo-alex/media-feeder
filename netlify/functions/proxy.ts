import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event, _context) => {
  const targetUrl = event.queryStringParameters?.url;

  if (!targetUrl) {
    return { statusCode: 400, body: 'Missing url query parameter' };
  }

  try {
    // Add browser-like headers to avoid being blocked
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      Referer: 'https://www.youtube.com/',
      Origin: 'https://www.youtube.com',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      Cookie:
        'CONSENT=YES+cb.20210328-17-p0.en+FX+419; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg',
    };

    const response = await fetch(targetUrl, {
      headers,
    });

    const content = await response.text();

    // Create response headers
    const responseHeaders: Record<string, string | number | boolean> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': response.headers.get('content-type') || 'text/plain',
    };

    return {
      statusCode: response.status,
      body: content,
      headers: responseHeaders,
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      body: `Proxy error: ${String(error)}`,
    };
  }
};
