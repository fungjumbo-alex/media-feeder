/// <reference types="vite/client" />
import type { ProxyAttemptCallback, ProxyStats, FeedType } from '../types';

/**
 * Checks if the content returned is a bot detection challenge page or a YouTube consent page.
 * Returns a descriptive reason if it's a challenge, or null if it appears valid.
 */
export const checkForBotChallenge = (text: string): string | null => {
  const normalizedText = text.toLowerCase();

  // YouTube Consent Page
  // V16 Hardening: Only flag as block if the actual video data (ytInitialPlayerResponse) is missing.
  // We've found that some successful loads still contain these strings in scripts/metadata.
  if (
    (normalizedText.includes('before you continue to youtube') ||
      normalizedText.includes('consent.google.com')) &&
    !text.includes('ytInitialPlayerResponse')
  ) {
    return 'YouTube Consent Page';
  }

  // Anubis Bot Detection (Common on some Invidious instances)
  if (
    normalizedText.includes("making sure you're not a bot!") ||
    normalizedText.includes('anubis_challenge') ||
    normalizedText.includes('protected by anubis')
  ) {
    return 'Bot Challenge (Anubis)';
  }

  // Generic Search/Bot protection strings
  if (
    normalizedText.includes('captcha-delivery.com') ||
    normalizedText.includes('challenge-platform/h/g') ||
    (normalizedText.includes('<title>access denied') && normalizedText.includes('cloudflare'))
  ) {
    return 'Bot Challenge (Generic/Cloudflare)';
  }

  return null;
};

// List of proxies to try in order.
// Each proxy has a function to construct its URL and a function to parse its response.
export const PROXIES = [
  {
    name: 'Browser Direct',
    buildUrl: (url: string) => url,
    parseResponse: async (response: Response): Promise<string> => {
      if (!response.ok) {
        throw new Error(`Browser Direct responded with status ${response.status}`);
      }
      const text = await response.text();
      const botReason = checkForBotChallenge(text);
      if (botReason) {
        throw new Error(`Browser Direct blocked by ${botReason}.`);
      }
      return text;
    },
  },
  {
    name: 'App Proxy',
    buildUrl: (url: string) => `/api/proxy?url=${encodeURIComponent(url)}&t=${Date.now()}`,
    parseResponse: async (response: Response): Promise<string> => {
      const text = await response.text();
      const botReason = checkForBotChallenge(text);
      const isHtmlError =
        text.trim().startsWith('<!DOCTYPE html') || text.trim().startsWith('<html');

      // If we expect XML (RSS/Atom) but get HTML, it's likely an error or blocking page
      // Exception: Some valid feeds might be wrapped in HTML (rare), but for YouTube/RSS it's usually bad
      // 3000 chars covers the 1781 bytes "Before you continue" page
      if (botReason || (text.length < 3000 && isHtmlError)) {
        const reason = botReason || 'invalid short HTML/error page';
        console.error(
          `[App Proxy] potentially invalid content (${reason}) for ${response.url}:`,
          text.substring(0, 500)
        );
        throw new Error(`App Proxy blocked by ${reason}.`);
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

      // Check for bot challenges in the nested content
      if (typeof data.contents === 'string') {
        const botReason = checkForBotChallenge(data.contents);
        if (botReason) {
          throw new Error(`Proxy AllOrigins (nest) blocked by ${botReason}.`);
        }
      }

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
      const text = await response.text();
      const botReason = checkForBotChallenge(text);
      if (botReason) {
        throw new Error(`Proxy AllOriginsRaw blocked by ${botReason}.`);
      }
      return text;
    },
  },
  {
    name: 'corsproxy.io',
    buildUrl: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    parseResponse: async (response: Response): Promise<string> => {
      // ... same implementation ...
      if (!response.ok) {
        throw new Error(`Proxy corsproxy.io responded with status ${response.status}`);
      }
      const text = await response.text();
      const botReason = checkForBotChallenge(text);
      if (botReason) throw new Error(`Proxy corsproxy.io blocked by ${botReason}.`);
      return text;
    },
  },
  {
    name: 'cors.sh',
    buildUrl: (url: string) => `https://proxy.cors.sh/${url}`,
    parseResponse: async (response: Response): Promise<string> => {
      if (!response.ok) throw new Error(`Proxy cors.sh responded with status ${response.status}`);
      return await response.text();
    },
  },
];

// List of public Invidious instances, which can act as proxies for YouTube content.
// Updated 2025-12-20: Expanded with more high-uptime instances
export const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net', // 🇩🇪 DE - High uptime
  'https://iv.ggtyler.dev', // 🇺🇸 US
  'https://invidious.tiekoetter.com', // 🇩🇪 DE
  'https://invidious.snopyta.org', // High reputation
  'https://iv.melmac.space', // 🇩🇪 DE
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
): Promise<{ content: string; proxyName: string }> => {
  let lastError: unknown = null;
  const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
  const currentStats: ProxyStats = JSON.parse(JSON.stringify(proxyStats || {}));
  console.log(
    `[Proxy] Initializing fetchViaProxy for ${url}. proxies available: ${proxiesToUse.length} (${proxiesToUse.map(p => p.name).join(', ')})`
  );

  // Helper to try a specific proxy/instance combination
  const tryRequest = async (
    proxy: (typeof PROXIES)[0],
    targetUrl: string
  ): Promise<string | null> => {
    const compositeKey = `${proxy.name}_${feedType}`;
    if (disabledProxies?.has(compositeKey)) {
      console.log(`[Proxy] Skipping ${proxy.name} for ${feedType} (disabled in settings)`);
      return null;
    }

    try {
      console.log(
        `[Proxy] Attempting ${proxy.name} for: ${targetUrl.substring(0, 100)}${targetUrl.length > 100 ? '...' : ''}`
      );
      const controller = new AbortController();
      const timeoutMs = 15000;
      const timeoutId = setTimeout(() => {
        controller.abort('timeout');
      }, timeoutMs);

      // Listener for external signal to abort this internal attempt
      const onExternalAbort = () => {
        controller.abort('external');
      };

      if (fetchOptions.signal) {
        if (fetchOptions.signal.aborted) {
          onExternalAbort();
        } else {
          fetchOptions.signal.addEventListener('abort', onExternalAbort, { once: true });
        }
      }

      try {
        const proxyUrl = proxy.buildUrl(targetUrl);
        const response = await fetch(proxyUrl, {
          ...fetchOptions,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Proxy ${proxy.name} responded with status ${response.status}.`);
        }

        const content = await proxy.parseResponse(response);
        onAttempt?.(proxy.name, 'success', feedType);
        return content;
      } finally {
        clearTimeout(timeoutId);
        if (fetchOptions.signal) {
          fetchOptions.signal.removeEventListener('abort', onExternalAbort);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.warn(`[Proxy] ${proxy.name} FAILED: ${errorMsg}`);
      lastError = error;
      onAttempt?.(proxy.name, 'failure', feedType);

      // Log stats
      if (!currentStats[proxy.name])
        currentStats[proxy.name] = {
          youtube: { success: 0, failure: 0 },
          rss: { success: 0, failure: 0 },
        };
      if (!currentStats[proxy.name][feedType])
        currentStats[proxy.name][feedType] = { success: 0, failure: 0 };
      currentStats[proxy.name][feedType].failure++;

      // If the EXTERNAL signal was the one that aborted, we MUST stop trying further proxies
      if (fetchOptions.signal?.aborted) {
        throw error;
      }

      // If it was just an interval timeout or a proxy error, catch it and the loop will try the next proxy
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
        if (result !== null) return { content: result, proxyName: proxy.name };
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
      console.log(`[Proxy] Successful retrieval using ${proxyToTry.name}`);
      // If successful and it's a YouTube request, store the successful config
      if (feedType === 'youtube') {
        const instance = INVIDIOUS_INSTANCES.find(inst => url.startsWith(inst));
        if (instance) {
          setStoredConfig(proxyToTry.name, instance);
        }
      }
      return { content: result, proxyName: proxyToTry.name };
    } else {
      console.warn(`[Proxy] ${proxyToTry.name} failed (returned null), trying next alternate...`);
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

export interface SourceTestResult {
  name: string;
  type: 'proxy' | 'invidious' | 'rsshub';
  status: 'ok' | 'error';
  latency: number;
  message?: string;
}

/**
 * Tests the availability and latency of all configured download sources.
 */
export const testAllSources = async (
  onProgress?: (result: SourceTestResult) => void
): Promise<SourceTestResult[]> => {
  const results: SourceTestResult[] = [];
  const TEST_RSS_URL =
    'https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ'; // MKBHD

  const testProxy = async (proxy: (typeof PROXIES)[0]): Promise<SourceTestResult> => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const proxyUrl = proxy.buildUrl(TEST_RSS_URL);
      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      const text = await proxy.parseResponse(response);
      if (text && text.length > 0) {
        return {
          name: proxy.name,
          type: 'proxy',
          status: 'ok',
          latency: Date.now() - start,
        };
      }
      throw new Error('Empty response');
    } catch (error) {
      return {
        name: proxy.name,
        type: 'proxy',
        status: 'error',
        latency: Date.now() - start,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const testInvidious = async (instance: string): Promise<SourceTestResult> => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Test the FEED endpoint (not video API) since that's what actually matters
      // Using MKBHD's channel as a stable test case
      const url = `${instance}/feed/channel/UCBJycsmduvYEL83R_U4JriQ`;
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const text = await response.text();
        // Verify it's actually XML feed content
        if (text && text.includes('<?xml') && text.includes('<feed')) {
          return {
            name: instance,
            type: 'invidious',
            status: 'ok',
            latency: Date.now() - start,
          };
        }
      }
      throw new Error(`Status ${response.status}`);
    } catch (error) {
      return {
        name: instance,
        type: 'invidious',
        status: 'error',
        latency: Date.now() - start,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const testRssHub = async (instance: string): Promise<SourceTestResult> => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Test with a simple Bilibili user feed if possible, or just the root/health
      const url = `${instance}/bilibili/user/video/2267573`; // Random active user
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        return {
          name: instance,
          type: 'rsshub',
          status: 'ok',
          latency: Date.now() - start,
        };
      }
      throw new Error(`Status ${response.status}`);
    } catch (error) {
      return {
        name: instance,
        type: 'rsshub',
        status: 'error',
        latency: Date.now() - start,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // Run tests in parallel with a limited concurrency or just sequentially for better progress reporting
  // Proxies
  for (const proxy of PROXIES) {
    const res = await testProxy(proxy);
    results.push(res);
    onProgress?.(res);
  }

  // Invidious (shuffled for better distribution in case many fail)
  const shuffledInvidious = [...INVIDIOUS_INSTANCES].sort(() => Math.random() - 0.5);
  for (const inst of shuffledInvidious) {
    const res = await testInvidious(inst);
    results.push(res);
    onProgress?.(res);
  }

  // RSSHub
  for (const inst of RSSHUB_INSTANCES) {
    const res = await testRssHub(inst);
    results.push(res);
    onProgress?.(res);
  }

  return results;
};
