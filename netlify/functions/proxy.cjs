exports.handler = async function (event, context) {
  const params = event.queryStringParameters;
  const targetUrl = params.url;

  if (!targetUrl) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing url query parameter' }),
    };
  }

  try {
    const isYouTube = targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be');

    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
      ...(isYouTube && {
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
      }),
    };

    const response = await fetch(targetUrl, {
      headers: fetchHeaders
    });

    console.log(`[Proxy] Response status: ${response.status} for ${targetUrl}`);

    const contentType = response.headers.get('content-type') || '';
    const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml');

    let body;
    let isBase64Encoded = false;

    if (isText) {
      body = await response.text();
    } else {
      const buffer = await response.arrayBuffer();
      body = Buffer.from(buffer).toString('base64');
      isBase64Encoded = true;
    }

    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType,
      },
      body: body,
      isBase64Encoded: isBase64Encoded
    };

  } catch (error) {
    console.error('[Proxy] Global error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: `Proxy error: ${error.message}`,
        stack: error.stack,
        targetUrl: targetUrl
      }),
    };
  }
};
