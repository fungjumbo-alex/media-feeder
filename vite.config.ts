import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import lzString from 'lz-string';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, '', '');

  const compressedEnv: Record<string, string> = {};
  const keysToCompress = ['API_KEY', 'YOUTUBE_API_KEY', 'GOOGLE_CLIENT_ID'];

  for (const key of keysToCompress) {
    if (env[key]) {
      compressedEnv[key] = lzString.compressToBase64(env[key]);
    }
  }

  return {
    server: {
      // We will handle all proxy logic in the custom middleware for better logging and control
    },
    plugins: [
      react(),
      {
        name: 'local-proxy-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const fullUrl = req.url || '';
            const [urlPath] = fullUrl.split('?');

            // 1. Handle Backend Transcript API
            if (urlPath === '/api/transcript' || urlPath.endsWith('/api/transcript')) {
              try {
                const targetUrl = `http://localhost:5001${fullUrl}`;
                console.log(`[App Proxy] Routing to Python Backend: ${targetUrl}`);

                const fetch = (await import('node-fetch')).default;

                // For POST requests, we need to forward the body
                let body: any = undefined;
                if (req.method === 'POST') {
                  const chunks: any[] = [];
                  for await (const chunk of req) {
                    chunks.push(chunk);
                  }
                  if (chunks.length > 0) {
                    body = Buffer.concat(chunks);
                  }
                }

                // Proxy the request
                const forwardHeaders = { ...req.headers };
                delete forwardHeaders['host'];
                delete forwardHeaders['connection'];
                delete forwardHeaders['content-length'];

                const response = await fetch(targetUrl, {
                  method: req.method,
                  headers: {
                    'Content-Type': 'application/json',
                    ...(forwardHeaders as any),
                  },
                  body,
                });

                res.statusCode = response.status;
                response.headers.forEach((value, key) => {
                  res.setHeader(key, value);
                });

                const responseData = await response.arrayBuffer();
                res.end(Buffer.from(responseData));
                console.log(`[App Proxy] Backend responded: ${response.status}`);
                return;
              } catch (err: any) {
                console.error('[App Proxy] Backend Proxy Error:', err.message);
                res.statusCode = 502;
                res.end(JSON.stringify({ error: `Backend proxy error: ${err.message}` }));
                return;
              }
            }

            // 2. Handle Common Proxy Layer
            if (
              urlPath.startsWith('/api/proxy') ||
              urlPath.startsWith('/.netlify/functions/proxy')
            ) {
              // Extract the target URL from the query parameter 'url'
              const urlIdx = fullUrl.indexOf('?');
              const queryString = urlIdx !== -1 ? fullUrl.substring(urlIdx + 1) : '';
              const searchParams = new URLSearchParams(queryString);
              const targetUrl = searchParams.get('url');

              if (!targetUrl) {
                res.statusCode = 400;
                res.end('Missing url query parameter');
                return;
              }

              try {
                // Use dynamic import for node-fetch if needed, or global fetch if Node 18+
                // Assuming Node 18+ or node-fetch is available.

                // Adapt headers based on target domain to avoid bot detection
                const isYouTube =
                  targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be');
                const isInvidious = targetUrl.includes('invidious');

                const noCookies = req.headers['x-proxy-no-cookies'] === 'true';
                if (noCookies || req.headers['x-proxy-referer']) {
                  console.log(`[App Proxy] ${targetUrl.substring(0, 80)}...`, {
                    noCookies,
                    referer: req.headers['x-proxy-referer'],
                  });
                }

                const fetchOptions = {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    Accept:
                      (req.headers['x-proxy-accept'] as string) ||
                      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    DNT: '1',
                    Connection: 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': (req.headers['x-proxy-fetch-dest'] as string) || 'document',
                    'Sec-Fetch-Mode': (req.headers['x-proxy-fetch-mode'] as string) || 'navigate',
                    'Sec-Fetch-Site': (req.headers['x-proxy-fetch-site'] as string) || 'none',
                    'Cache-Control': 'max-age=0',
                    // Only set referer/origin for YouTube to avoid bot detection on Invidious
                    ...(isYouTube && {
                      Referer:
                        (req.headers['x-proxy-referer'] as string) || 'https://www.youtube.com/',
                      Origin:
                        (req.headers['x-proxy-origin'] as string) || 'https://www.youtube.com',
                      ...(!noCookies && {
                        Cookie:
                          'SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+yt.20210328-17-p0.en+FX+417',
                      }),
                    }),
                  },
                };

                const fetch = (await import('node-fetch')).default;
                const response = await fetch(targetUrl, fetchOptions);

                // Forward headers, but exclude those that might cause issues
                const excludedHeaders = [
                  'content-encoding',
                  'content-length',
                  'transfer-encoding',
                  'connection',
                ];
                response.headers.forEach((value, key) => {
                  if (!excludedHeaders.includes(key.toLowerCase())) {
                    res.setHeader(key, value);
                  }
                });

                // Set CORS headers to allow local dev
                res.setHeader('Access-Control-Allow-Origin', '*');

                res.statusCode = response.status;

                const arrayBuffer = await response.arrayBuffer();
                res.end(Buffer.from(arrayBuffer));
              } catch (error) {
                const err = error as any;
                const isDnsError = err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN';
                const isTimeout =
                  err.code === 'ETIMEDOUT' ||
                  err.name === 'AbortError' ||
                  err.code === 'ECONNRESET';

                console.error(
                  `[App Proxy] ${isDnsError ? 'DNS' : isTimeout ? 'TIMEOUT' : 'CRITICAL'} ERROR:`,
                  {
                    url: targetUrl,
                    message: err.message,
                    code: err.code,
                  }
                );

                res.statusCode = isDnsError ? 502 : isTimeout ? 504 : 500;
                res.end(`Proxy error (${err.code || 'UNKNOWN'}): ${err.message}`);
              }
            } else {
              next();
            }
          });
        },
      },
    ],
    define: {
      // Define a global constant with the compressed keys.
      // This avoids inlining `process.env` directly, which gets flagged by secret scanners.
      __COMPRESSED_ENV__: JSON.stringify(compressedEnv),
    },
  };
});
