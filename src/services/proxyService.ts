import type { ProxyAttemptCallback, ProxyStats, FeedType } from '../types';

// List of proxies to try in order.
// Each proxy has a function to construct its URL and a function to parse its response.
export const PROXIES = [
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
                             throw new Error(`Proxy corsproxy.io responded with status ${response.status}: ${errorJson.error.message}`);
                        }
                    } catch (e) { /* ignore json parsing error */ }
                }
                throw new Error(`Proxy corsproxy.io responded with status ${response.status}`);
            }
            return response.text();
        }
    },
   // {
    //    name: 'AllOrigins',
   //     buildUrl: (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
   //     parseResponse: async (response: Response): Promise<string> => {
   //          if (!response.ok) {
   //             throw new Error(`Proxy AllOrigins responded with status ${response.status}`);
   //         }
   //         const data = await response.json();
   //         if (data.status && data.status.http_code && data.status.http_code >= 400) {
   //              throw new Error(`Target server responded with status ${data.status.http_code} via AllOrigins`);
   //         }
   //         if (data.contents === null) {
  //             throw new Error('Proxy AllOrigins returned null content, indicating a fetch error.');
  //          }
   //         return data.contents;
  //      }
  //  },
    {
        name: 'cors.eu.org',
        buildUrl: (url: string) => `https://cors.eu.org/${url.replace(/^https?:\/\//, '')}`,
        parseResponse: async (response: Response): Promise<string> => {
            if (!response.ok) {
                 throw new Error(`Proxy cors.eu.org responded with status ${response.status}`);
            }
            return response.text();
        }
    }
];

// List of public Invidious instances, which can act as proxies for YouTube content.
export const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://yewtu.be'
  //  'https://yt.artemislena.eu',
  //  'https://invidious.flokinet.to',
  //  'https://invidious.privacydev.net',
  //  'https://iv.melmac.space',
  //  'https://inv.tux.pizza',
  //  'https://invidious.protokolla.fi',
  //  'https://invidious.private.coffee',
  //  'https://yt.drgnz.club'
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

export const fetchViaProxy = async (
    url: string,
    feedType: FeedType,
    onAttempt?: ProxyAttemptCallback,
    disabledProxies?: Set<string>,
    proxyStats?: ProxyStats,
    proxiesToUse = PROXIES,
): Promise<string> => {
    let lastError: unknown = null;
    const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
    const currentStats: ProxyStats = JSON.parse(JSON.stringify(proxyStats || {}));

    const tryProxyAttempt = async (proxy: typeof PROXIES[0]): Promise<string | null> => {
        const compositeKey = `${proxy.name}_${feedType}`;
        if (disabledProxies?.has(compositeKey)) {
            return null;
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort('signal is aborted without reason'), 30000);
            const proxyUrl = proxy.buildUrl(url);
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                redirect: 'error'
            });
            clearTimeout(timeoutId);
            const content = await proxy.parseResponse(response);
            if (content) {
                onAttempt?.(proxy.name, 'success', feedType);
                if (url.includes('/api/v1/captions/')) {
                    console.log(`[DEBUG] Successfully fetched transcript via: ${proxyUrl}`);
                }
                return content;
            }
            throw new Error("Proxy returned empty content.");
        } catch (error) {
            let specificError = error;
            if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
                specificError = new Error(`Network error for proxy '${proxy.name}'. It may be offline or blocked by an ad-blocker.`);
            }
            lastError = specificError;
            onAttempt?.(proxy.name, 'failure', feedType);

            if (!currentStats[proxy.name]) {
                currentStats[proxy.name] = { youtube: { success: 0, failure: 0 }, rss: { success: 0, failure: 0 } };
            }
            if (!currentStats[proxy.name][feedType]) {
                currentStats[proxy.name][feedType] = { success: 0, failure: 0 };
            }
            currentStats[proxy.name][feedType].failure++;
            
            const message = specificError instanceof Error ? specificError.message : String(specificError);
            console.warn(`Proxy ${proxy.name} for ${feedType} failed:`, message);
            return null;
        }
    };

    let remainingProxies = [...proxiesToUse];

    while (remainingProxies.length > 0) {
        const getSuccessRate = (name: string) => {
            const stats = currentStats[name]?.[feedType];
            if (!stats || (stats.success + stats.failure === 0)) return Infinity;
            return stats.success / (stats.success + stats.failure);
        };
        remainingProxies.sort((a, b) => getSuccessRate(b.name) - getSuccessRate(a.name));
        
        const proxyToTry = remainingProxies.shift()!;
        
        await wait(100);
        const result = await tryProxyAttempt(proxyToTry);
        if (result !== null) return result;
    }
    
    console.error(`All proxies for ${feedType} failed.`, lastError);
    
    let errorMessage = 'Unknown error';
    if (lastError instanceof Error) {
        errorMessage = lastError.message;
    } else if (lastError) {
        errorMessage = String(lastError);
    }
    
    throw new Error(`Failed to fetch content after trying all available proxies. Last error: ${errorMessage}`);
};