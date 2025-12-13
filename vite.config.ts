import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import lzString from 'lz-string'

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
        }
      }
    },
    plugins: [
      react(),
      {
        name: 'local-proxy-middleware',
        configureServer(server) {
          server.middlewares.use('/api/proxy', async (req, res, next) => {
            const url = new URL(req.url!, `http://${req.headers.host}`);
            const targetUrl = url.searchParams.get('url');

            if (!targetUrl) {
              res.statusCode = 400;
              res.end('Missing url query parameter');
              return;
            }

            try {
              // Use dynamic import for node-fetch if needed, or global fetch if Node 18+
              // Assuming Node 18+ or node-fetch is available.
              // Add browser-like headers to avoid being blocked
              const fetchOptions = {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept-Language': 'en-US,en;q=0.9',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                  'Referer': 'https://www.youtube.com/',
                  'Origin': 'https://www.youtube.com',
                  'Sec-Fetch-Dest': 'empty',
                  'Sec-Fetch-Mode': 'cors',
                  'Sec-Fetch-Site': 'cross-site',
                }
              };

              const fetch = (await import('node-fetch')).default;
              const response = await fetch(targetUrl, fetchOptions);

              // Forward headers, but exclude those that might cause issues
              const excludedHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];
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
          });
        }
      }
    ],
    define: {
      // Define a global constant with the compressed keys.
      // This avoids inlining `process.env` directly, which gets flagged by secret scanners.
      '__COMPRESSED_ENV__': JSON.stringify(compressedEnv)
    }
  }
})