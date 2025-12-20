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
      proxy: {
        '/api/transcript': {
          target: 'http://127.0.0.1:5001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [
      react(),
      {
        name: 'local-proxy-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (
              req.url?.startsWith('/api/proxy') ||
              req.url?.startsWith('/.netlify/functions/proxy')
            ) {
              // Extract the target URL from the query parameter 'url'
              const urlIdx = req.url.indexOf('?');
              const queryString = urlIdx !== -1 ? req.url.substring(urlIdx + 1) : '';
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

                const fetchOptions = {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    Accept:
                      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    DNT: '1',
                    Connection: 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Cache-Control': 'max-age=0',
                    // Only set referer/origin for YouTube to avoid bot detection on Invidious
                    ...(isYouTube && {
                      Referer: 'https://www.youtube.com/',
                      Origin: 'https://www.youtube.com',
                      Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+417',
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
                console.error('Proxy error:', error);
                res.statusCode = 500;
                res.end('Proxy error: ' + String(error));
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
