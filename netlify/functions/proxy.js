// Standalone Netlify Function (CommonJS)
// No build step required for manual deployment.

exports.handler = async function (event, context) {
  const params = event.queryStringParameters || {};
  const targetUrl = params.url;

  if (!targetUrl) {
    return {
      statusCode: 400,
      body: 'Missing url query parameter',
    };
  }

  try {
    // Add browser-like headers to avoid being blocked
    const headers = {
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

    // Use native fetch (available in Netlify Node 18+ runtime)
    const response = await fetch(targetUrl, {
      headers,
    });

    const content = await response.text();

    return {
      statusCode: response.status,
      body: content,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': response.headers.get('content-type') || 'text/plain',
      },
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      body: `Proxy error: ${error.toString()}`,
    };
  }
};
