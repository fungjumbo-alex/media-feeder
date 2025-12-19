/// <reference types="vite/client" />
import type { ProxyAttemptCallback, ProxyStats, FeedType } from '../types';

// List of proxies to try in order.
// Each proxy has a function to construct its URL and a function to parse its response.
export const PROXIES = [
  {
    name: 'App Proxy',
    buildUrl: (url: string) => `/api/proxy?url=${encodeURIComponent(url)}&t=${Date.now()}`,
    parseResponse: async (response: Response): Promise<string> => {
      const text = await response.text();
      // Check for common error pages that return 200 OK
      const isConsentPage =
        text.includes('Before you continue to YouTube') || text.includes('consent.google.com');
      const isHtmlError =
        text.trim().startsWith('<!DOCTYPE html') || text.trim().startsWith('<html');

      // If we expect XML (RSS/Atom) but get HTML, it's likely an error or blocking page
      // Exception: Some valid feeds might be wrapped in HTML (rare), but for YouTube/RSS it's usually bad
      // 3000 chars covers the 1781 bytes "Before you continue" page
      if (isConsentPage || (text.length < 3000 && isHtmlError)) {
        console.error(
          `[App Proxy] potentially invalid content for ${response.url}:`,
          text.substring(0, 500)
        );
        throw new Error(`App Proxy returned invalid content (likely consent page or error).`);
      }

      if (!response.ok) {
        console.error(`[App Proxy] Error accessing ${response.url}:`, response.status, text);
        throw new Error(`App Proxy responded with status ${response.status}. Body: ${text}`);
      }

      console.log(`[App Proxy] Success for ${response.url}. Length: ${text.length}`);
      if (text.length < 3000) {
        console.log(`[App Proxy] Content snippet:`, text);
      }
      return text;
    },
  },
  {
    name: 'AllOrigins',
    buildUrl: (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    parseResponse: async (response: Response): Promise<string> => {
      if (!response.ok) {
        throw new Error(`Proxy AllOrigins responded with status ${response.status}`);
      }
      const data = await response.json();
      // AllOrigins returns the status code of the fetched URL in `status.http_code`
      if (data.status?.http_code && data.status.http_code >= 400) {
        throw new Error(
          `Target server responded with status ${data.status.http_code} via AllOrigins`
        );
      }
      // Sometimes AllOrigins returns null contents if the fetch failed silently
      if (data.contents === null || data.contents === undefined) {
        throw new Error('Proxy AllOrigins returned null/undefined content.');
      }
      return data.contents;
    },
  },
  {
    name: 'AllOriginsRaw',
    buildUrl: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    parseResponse: async (response: Response): Promise<string> => {
      if (!response.ok) {
        throw new Error(`Proxy AllOriginsRaw responded with status ${response.status}`);
      }
      return response.text();
    },
  },
  {
    name: 'corsproxy.io',
    buildUrl: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    parseResponse: async (response: Response): Promise<string> => {
      if (!response.ok) {
        const errorBody = await response.text().catch(() => null);
        if (errorBody) {
          try {
            const errorJson = JSON.parse(errorBody);
            if (errorJson?.error?.message) {
              throw new Error(
                `Proxy corsproxy.io responded with status ${response.status}: ${errorJson.error.message}`
              );
            }
          } catch {
            /* ignore json parsing error */
          }
        }
        throw new Error(`Proxy corsproxy.io responded with status ${response.status}`);
      }
      return response.text();
    },
  },
];

// List of public Invidious instances, which can act as proxies for YouTube content.
// Updated 2025-12-14: Added high uptime instances
// List of public Invidious instances, which can act as proxies for YouTube content.
// Updated 2025-12-14: Removed instances failing with 403/HTML responses
// Updated 2025-12-16: Added more reliable instances
// Updated 2025-12-18: Added high uptime instances from api.invidious.io
// Updated 2025-12-19: Removed slow/timing out instances, added high uptime ones
export const INVIDIOUS_INSTANCES = [
  'https://invidious.ducks.cloud',
  'https://inv.venom.is',
  'https://invidious.nerdvpn.de',
  'https://inv.perditum.com',
  'https://inv.nadeko.net',
  'https://inv.tux.pizza',
  'https://yewtu.be',
  'https://invidious.no-logs.com',
  'https://iv.melmac.space',
  'https://invidious.projectsegfau.lt',
  'https://invidious.privacydev.net',
  'https://invidious.waterpigs.me',
  'https://invidious.lunar.icu',
  'https://inv.zzls.xyz',
];

// List of public RSSHub instances for generating feeds from sites like Bilibili.
export const RSSHUB_INSTANCES = [
  'https://rsshub.woodland.cafe',
  'https://rsshub.app', // Official
  'https://rsshub.rssforever.com',
  'https://hub.slarker.me',
  'https://rsshub.pseudoyu.com',
  'https://rsshub.rss.tips',
  'https://rsshub.ktachibana.party',
  'https://rss.owo.nz',
  'https://rss.littlebaby.life',
].map(url => url.replace(/\/$/, '')); // Normalize URLs by removing any trailing slashes.

// Helper to get/set working proxy from localStorage
const STORAGE_KEY = 'media_feeder_working_proxy_config';
interface ProxyConfig {
  proxyName: string;
  instanceUrl: string;
  timestamp: number;
}

const getStoredConfig = (): ProxyConfig | null => {
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    if (item) return JSON.parse(item);
  } catch {
    /* ignore */
  }
  return null;
};

const setStoredConfig = (proxyName: string, instanceUrl: string) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        proxyName,
        instanceUrl,
        timestamp: Date.now(),
      })
    );
  } catch {
    /* ignore */
  }
};

export const fetchViaProxy = async (
  url: string,
  feedType: FeedType,
  onAttempt?: ProxyAttemptCallback,
  disabledProxies?: Set<string>,
  proxyStats?: ProxyStats,
  proxiesToUse = PROXIES,
  fetchOptions: RequestInit = {}
): Promise<string> => {
  let lastError: unknown = null;
  const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
  const currentStats: ProxyStats = JSON.parse(JSON.stringify(proxyStats || {}));
  console.log(`[Proxy] Initializing fetchViaProxy for ${url}. proxies available: ${proxiesToUse.length} (${proxiesToUse.map(p => p.name).join(', ')})`);

  // Helper to try a specific proxy/instance combination
  const tryRequest = async (
    proxy: (typeof PROXIES)[0],
    targetUrl: string
  ): Promise<string | null> => {
    const compositeKey = `${proxy.name}_${feedType}`;
    if (disabledProxies?.has(compositeKey)) return null;

    try {
      console.log(`[Proxy] Trying ${proxy.name} for: ${targetUrl.substring(0, 100)}${targetUrl.length > 100 ? '...' : ''}`);
      const controller = new AbortController();

      // Respect passed-in signal if any, or use default 15s (reduced from 30s)
      const timeoutMs = 15000;
      const timeoutId = setTimeout(
        () => {
          console.warn(`[Proxy] ${proxy.name} timed out after ${timeoutMs}ms`);
          controller.abort('timeout');
        },
        timeoutMs
      );

      const proxyUrl = proxy.buildUrl(targetUrl);

      const mergedOptions: RequestInit = {
        ...fetchOptions,
        signal: controller.signal,
      };

      // Handle the case where the external signal is already aborted
      if (fetchOptions.signal?.aborted) {
        throw new Error('Signal already aborted');
      }

      // If an external signal is provided, listen for its abort to trigger ours
      if (fetchOptions.signal) {
        if (fetchOptions.signal.aborted) {
          controller.abort('external');
        } else {
          fetchOptions.signal.addEventListener('abort', () => {
            console.warn(`[Proxy] External signal aborted for ${proxy.name}`);
            controller.abort('external');
          }, { once: true });
        }
      }

      const response = await fetch(proxyUrl, mergedOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Proxy] ${proxy.name} returned status ${response.status} for ${targetUrl}`);
        throw new Error(`Proxy ${proxy.name} responded with status ${response.status}.`);
      }

      const content = await proxy.parseResponse(response);

      onAttempt?.(proxy.name, 'success', feedType);
      console.log(`[Proxy] ${proxy.name} success! Content length: ${content.length}`);
      return content;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Proxy] ${proxy.name} failed: ${errorMsg}`);

      let specificError = error;
      if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
        specificError = new Error(
          `Network error for proxy '${proxy.name}'. It may be offline or blocked by an ad-blocker.`
        );
      }
      lastError = specificError;
      onAttempt?.(proxy.name, 'failure', feedType);

      if (!currentStats[proxy.name]) {
        currentStats[proxy.name] = {
          youtube: { success: 0, failure: 0 },
          rss: { success: 0, failure: 0 },
        };
      }
      if (!currentStats[proxy.name][feedType]) {
        currentStats[proxy.name][feedType] = { success: 0, failure: 0 };
      }
      currentStats[proxy.name][feedType].failure++;
      return null;
    }
  };

  // 1. Try stored config first if available and fresh (less than 1 hour old)
  const stored = getStoredConfig();
  if (stored && Date.now() - stored.timestamp < 3600000) {
    const proxy = proxiesToUse.find(p => p.name === stored.proxyName);
    if (proxy) {
      // Check if the URL belongs to the stored instance
      // This is a heuristic: if the URL starts with the stored instance URL, we use this proxy.
      // For general URLs (RSS), we just try the proxy.
      if (url.startsWith(stored.instanceUrl) || feedType !== 'youtube') {
        const result = await tryRequest(proxy, url);
        if (result !== null) return result;
        // If stored config failed, clear it and fall back to full search
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }

  // 2. Fallback to trying all proxies
  const remainingProxies = [...proxiesToUse];
  while (remainingProxies.length > 0) {
    const getSuccessRate = (name: string) => {
      const stats = currentStats[name]?.[feedType];
      if (!stats || stats.success + stats.failure === 0) return Infinity;
      return stats.success / (stats.success + stats.failure);
    };
    remainingProxies.sort((a, b) => getSuccessRate(b.name) - getSuccessRate(a.name));

    const proxyToTry = remainingProxies.shift();
    if (!proxyToTry) continue;

    await wait(100);
    const result = await tryRequest(proxyToTry, url);
    if (result !== null) {
      // If successful and it's a YouTube request, store the successful config
      if (feedType === 'youtube') {
        // Extract instance URL from the request URL
        const instance = INVIDIOUS_INSTANCES.find(inst => url.startsWith(inst));
        if (instance) {
          setStoredConfig(proxyToTry.name, instance);
        }
      }
      return result;
    }
  }

  let errorMessage = 'Unknown error';
  if (lastError instanceof Error) {
    errorMessage = lastError.message;
  } else if (lastError) {
    errorMessage = String(lastError);
  }

  throw new Error(
    `Failed to fetch content after trying all available proxies. Last error: ${errorMessage}`
  );
};
