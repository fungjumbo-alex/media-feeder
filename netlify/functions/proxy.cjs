const https = require('https');
const http = require('http');

exports.handler = async function (event, context) {
  const params = event.queryStringParameters;
  const targetUrl = params.url;

  if (!targetUrl) {
    return {
      statusCode: 400,
      body: 'Missing url query parameter',
    };
  }

  try {
    const urlObj = new URL(targetUrl);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        // Forward some headers if needed, but usually minimal is better for avoiding blocks on simple proxies
      }
    };

    return new Promise((resolve, reject) => {
      const lib = urlObj.protocol === 'https:' ? https : http;
      const req = lib.get(targetUrl, options, (res) => {
        const bodyChunks = [];
        res.on('data', (chunk) => bodyChunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(bodyChunks);

          // Should we return base64 for binary? Ideally yes, but for text content simply regular string is fine.
          // Netlify functions return base64 encoded body if isBase64Encoded is true.
          // For simplicity in this specific "proxy" which is mostly for text/html/json:

          const contentType = res.headers['content-type'] || '';
          const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml');

          const response = {
            statusCode: res.statusCode,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': contentType,
            },
            body: isText ? body.toString('utf8') : body.toString('base64'),
            isBase64Encoded: !isText
          };
          resolve(response);
        });
      });

      req.on('error', (e) => {
        console.error('Proxy request error:', e);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: `Proxy request error: ${e.message}` }),
        });
      });

      // Add 10 second timeout
      req.setTimeout(10000, () => {
        req.destroy();
        resolve({
          statusCode: 504,
          body: JSON.stringify({ error: 'Proxy timeout after 10s' }),
        });
      });
    });

  } catch (error) {
    return {
      statusCode: 500,
      body: `Proxy error: ${error.message}`,
    };
  }
};
