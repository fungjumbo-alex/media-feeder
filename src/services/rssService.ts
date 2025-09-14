import type { Feed, Article, ProxyAttemptCallback, ProxyStats, FeedType } from '../types';
import { fetchViaProxy } from './proxyService';
import { INVIDIOUS_INSTANCES, RSSHUB_INSTANCES } from './proxyService';

// --- Helper for YouTube fetching via Invidious ---
const fetchYouTubeRssViaInvidious = async (
    youtubeUrl: string,
    onProxyAttempt?: ProxyAttemptCallback,
    disabledProxies?: Set<string>,
    proxyStats?: ProxyStats
): Promise<{ content: string, discoveredUrl: string | null, pageIconUrl: string | null, discoveredChannelId: string | null }> => {
    let channelId: string | null = null;
    let playlistId: string | null = null;
    let pageIconUrl: string | null = null;
    const parser = new DOMParser();

    try {
        const urlObject = new URL(youtubeUrl);
        playlistId = urlObject.searchParams.get('list');
    } catch (e) { /* ignore, will fallback to HTML fetch */ }

    // Logic separation: handle playlists differently from other YouTube URLs.
    if (playlistId) {
        // For playlists, we don't fetch HTML. We go straight to Invidious.
        // We won't get a custom icon this way, but playlist pages don't have one anyway.
        // The channel ID is not in the URL, so we can't pre-fetch the channel page.
    } else {
        // For ANY non-playlist URL (channel, video, @handle), always fetch the HTML first to get the best icon and canonical ID.
        const htmlContent = await fetchViaProxy(youtubeUrl, 'youtube', onProxyAttempt, disabledProxies, proxyStats);
        const htmlDoc = parser.parseFromString(htmlContent, 'text/html');
        
        // --- Robust Icon Extraction ---
        // New Method: Parse ytInitialData for the high-quality avatar
        const initialDataScript = Array.from(htmlDoc.querySelectorAll('script')).find(
            script => script.textContent?.includes('var ytInitialData =')
        );
        if (initialDataScript?.textContent) {
            const match = initialDataScript.textContent.match(/var ytInitialData = (\{.*?\});/s);
            if (match?.[1]) {
                try {
                    const initialData = JSON.parse(match[1]);
                    // Path for channel pages and @handle pages
                    const avatarThumbnails = 
                        initialData?.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails ||
                        initialData?.metadata?.channelMetadataRenderer?.avatar?.thumbnails;
                    
                    if (avatarThumbnails && avatarThumbnails.length > 0) {
                        // Get the highest resolution available, typically the last one
                        pageIconUrl = avatarThumbnails[avatarThumbnails.length - 1].url;
                    }
                } catch (e) {
                    console.warn("Failed to parse ytInitialData for icon", e);
                }
            }
        }
        
        // Fallback: Use og:image if the new method fails
        if (!pageIconUrl) {
            const ogImageEl = htmlDoc.querySelector('meta[property="og:image"]');
            if (ogImageEl?.getAttribute('content')) {
                pageIconUrl = ogImageEl.getAttribute('content');
            }
        }
        
        // --- Robust Channel ID Extraction ---
        // Method 1: Canonical URL
        const canonicalLink = htmlDoc.querySelector('link[rel="canonical"]');
        if (canonicalLink) {
            const canonicalUrl = canonicalLink.getAttribute('href');
            if (canonicalUrl) {
                const match = canonicalUrl.match(/\/channel\/(UC[\w-]{22})/);
                if (match && match[1]) {
                    channelId = match[1];
                }
            }
        }
        
        // Method 2: Meta tag
        if (!channelId) {
            const metaTag = htmlDoc.querySelector('meta[itemprop="channelId"]');
            if (metaTag) channelId = metaTag.getAttribute('content');
        }
        
        // Method 3: Brute-force regex on the whole HTML
        if (!channelId) {
            const channelIdMatch = htmlContent.match(/"channelId":"(UC[\w-]{22})"/);
            if (channelIdMatch?.[1]) channelId = channelIdMatch[1];
        }

        if (!channelId) throw new Error("Could not discover a Channel ID from the provided YouTube URL.");
    }

    // Now fetch feed from Invidious using the discovered ID
    let lastError: unknown = null;
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const invidiousFeedUrl = playlistId 
                ? `${instance}/feed/playlist/${playlistId}`
                // If channelId is null here, it must be a playlist.
                : `${instance}/feed/channel/${channelId!}`;
            
            const content = await fetchViaProxy(invidiousFeedUrl, 'youtube', onProxyAttempt, disabledProxies, proxyStats);
            if (content) {
                const doc = parser.parseFromString(content, 'application/xml');
                if (!doc.querySelector('parsererror')) {
                    return { content, discoveredUrl: invidiousFeedUrl, pageIconUrl, discoveredChannelId: channelId };
                }
                throw new Error("Invidious instance returned non-XML content.");
            }
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[DEBUG] Invidious instance ${instance} failed to provide a feed: ${message}. Trying next instance.`);
        }
    }
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`All Invidious instances failed to provide a feed. Last error: ${errorMessage}`);
};

// --- Helper for Bilibili fetching via RSSHub ---
const getBilibiliRssHubPath = (bilibiliUrl: string): string | null => {
    try {
        const urlObject = new URL(bilibiliUrl);
        const hostname = urlObject.hostname;
        const pathname = urlObject.pathname;

        // User profile pages
        // Handles formats like:
        // - https://space.bilibili.com/USER_ID
        // - https://www.bilibili.com/space/USER_ID
        if (hostname.includes('bilibili.com') && (hostname === 'space.bilibili.com' || pathname.startsWith('/space/'))) {
            const userIdMatch = pathname.match(/(\d+)/);
            if (userIdMatch && userIdMatch[1]) {
                return `/bilibili/user/video/${userIdMatch[1]}`;
            }
        }
        
        // Category pages
        const categoryMatch = pathname.match(/^\/(?:c|v\/popular)\/([a-zA-Z]+)/);
        if (categoryMatch && categoryMatch[1]) {
            const categoryName = categoryMatch[1].toLowerCase();
            const categoryMap: Record<string, number> = {
                cinephile: 181, cinema: 181, anime: 1, music: 3, tech: 188,
                food: 211, life: 160, game: 4, ent: 5, movie: 181, dance: 129,
                knowledge: 36, sports: 234, car: 223, fashion: 155, animal: 217, kichiku: 119
            };
            if (categoryMap[categoryName]) return `/bilibili/partion/${categoryMap[categoryName]}`;
        }
        
        // Partition pages (numeric categories)
        const partitionMatch = pathname.match(/\/v\/popular\/partition\/(\d+)/);
        if (partitionMatch && partitionMatch[1]) {
            return `/bilibili/partion/${partitionMatch[1]}`;
        }

        return null;
    } catch (e) {
        console.warn("Could not parse Bilibili URL to create RSSHub path.", e);
        return null;
    }
};

const fetchBilibiliRssViaRssHub = async (
    bilibiliUrl: string,
    onProxyAttempt?: ProxyAttemptCallback,
    disabledProxies?: Set<string>,
    proxyStats?: ProxyStats
): Promise<{ content: string, discoveredUrl: string | null }> => {
    
    const rssHubPath = getBilibiliRssHubPath(bilibiliUrl);
    
    if (!rssHubPath) {
        throw new Error("Could not convert the provided Bilibili URL into a valid feed URL. Please check if the URL format is supported.");
    }

    const parser = new DOMParser();
    let lastError: unknown = null;
    for (const instance of RSSHUB_INSTANCES) {
        try {
            const rsshubUrl = `${instance}${rssHubPath}`;
            
            const content = await fetchViaProxy(rsshubUrl, 'rss', onProxyAttempt, disabledProxies, proxyStats);
            
            const doc = parser.parseFromString(content, 'application/xml');
            if (!doc.querySelector('parsererror')) {
                 return { content, discoveredUrl: rsshubUrl };
            }
            throw new Error(`RSSHub instance ${instance} returned invalid XML content.`);

        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[DEBUG] RSSHub instance ${instance} failed: ${message}. Trying next instance.`);
        }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`All RSSHub instances failed to fetch the Bilibili feed. Last error: ${errorMessage}`);
};

const getBilibiliCanonicalUrl = (bilibiliUrl: string): string | null => {
    try {
        const urlObject = new URL(bilibiliUrl);
        const hostname = urlObject.hostname;
        const pathname = urlObject.pathname;

        // User profile pages
        // Handles formats like:
        // - https://space.bilibili.com/USER_ID
        // - https://www.bilibili.com/space/USER_ID
        if (hostname.includes('bilibili.com') && (hostname === 'space.bilibili.com' || pathname.startsWith('/space/'))) {
            const userIdMatch = pathname.match(/(\d+)/);
            if (userIdMatch && userIdMatch[1]) {
                return `https://space.bilibili.com/${userIdMatch[1]}`;
            }
        }
        
        // Could add more normalization for other Bilibili URL types here in the future
    } catch (e) {
        console.warn("Could not parse Bilibili URL for canonicalization.", e);
    }
    return null;
};


// --- Robust XML Parsing Helpers ---
const findElement = (element: Document | Element, tags: string[]): Element | null => {
    for (const tag of tags) {
        const localName = tag.split(':').pop() || '';
        if (localName) {
            const nodeList = element.getElementsByTagNameNS('*', localName);
            if (nodeList.length > 0) return nodeList[0];
        }
        const fallbackNodeList = element.getElementsByTagName(tag);
        if (fallbackNodeList.length > 0) return fallbackNodeList[0];
    }
    return null;
};

const findText = (element: Document | Element, tags: string[]): string | null => {
    const el = findElement(element, tags);
    return el?.textContent?.trim() || null;
};

const findHtml = (element: Element, tags: string[]): string => {
    const el = findElement(element, tags);
    return (el as any)?.innerHTML || el?.textContent || '';
};

const findAttr = (element: Element, tags: string[], attr: string): string | null => {
    const el = findElement(element, tags);
    if (el?.hasAttribute(attr)) return el.getAttribute(attr);
    return null;
}

const findMediaContentAttrs = (element: Element): { height?: number, width?: number, duration?: number } => {
    const mediaContent = findElement(element, ['media:content']);
    if (!mediaContent) return {};

    const heightAttr = mediaContent.getAttribute('height');
    const widthAttr = mediaContent.getAttribute('width');
    const durationAttr = mediaContent.getAttribute('duration');

    const height = heightAttr ? parseInt(heightAttr, 10) : undefined;
    const width = widthAttr ? parseInt(widthAttr, 10) : undefined;
    const duration = durationAttr ? parseInt(durationAttr, 10) : undefined;
    
    return {
        height: !isNaN(height!) ? height : undefined,
        width: !isNaN(width!) ? width : undefined,
        duration: !isNaN(duration!) ? duration : undefined,
    };
};

const getImage = (item: Element, htmlContent: string): string | null => {
    const mediaThumbnail = findElement(item, ['media:thumbnail', 'thumbnail']);
    if (mediaThumbnail?.getAttribute('url')) return mediaThumbnail.getAttribute('url');
    const mediaContent = item.querySelector('media\\:content[medium="image"], content[medium="image"]');
    if (mediaContent?.getAttribute('url')) return mediaContent.getAttribute('url');
    const enclosure = item.querySelector('enclosure[type^="image"]');
    if (enclosure?.getAttribute('url')) return enclosure.getAttribute('url');
    
    if (htmlContent) {
        try {
            const contentDoc = new DOMParser().parseFromString(htmlContent, 'text/html');
            const img = contentDoc.querySelector('img');
            // Ignore tiny data URIs which are likely tracking pixels or spacers
            if (img && img.src && (!img.src.startsWith('data:image/') || img.src.length > 200)) {
                return img.dataset.src || img.src;
            }
        } catch (e) {
            console.error("Error parsing HTML content for image:", e);
        }
    }
    return null;
}

const decodeHtmlEntities = (text: string): string => {
    try {
        const textarea = document.createElement('textarea');
        let currentText = text;
        // Keep decoding until the string stops changing to handle multiple layers of encoding
        while (true) {
            textarea.innerHTML = currentText;
            const decodedText = textarea.value;
            if (decodedText === currentText) {
                break; // No more entities to decode
            }
            currentText = decodedText;
        }
        return currentText;
    } catch (e) {
        console.error("Could not decode HTML entities, returning original text.", e);
        return text;
    }
};

export const fetchAndParseRss = async (
    url: string, 
    defaultTitle?: string,
    onProxyAttempt?: ProxyAttemptCallback,
    disabledProxies?: Set<string>,
    proxyStats?: ProxyStats,
    maxArticles?: number,
): Promise<Feed> => {
    if (!url) throw new Error('URL cannot be empty.');
    if (/youtube\.com\/feed\/(subscriptions|history)/.test(url)) {
        throw new Error("This looks like a personal YouTube page (e.g., Subscriptions or History). Public channel or playlist links are supported.");
    }

    const numArticles = maxArticles ?? 5;
    let fetchUrl = url;
    
    // Normalize and sanitize YouTube URLs.
    if (fetchUrl.includes('youtube.com') || fetchUrl.includes('youtu.be')) {
        fetchUrl = fetchUrl.replace('m.youtube.com', 'www.youtube.com');
        try {
            const urlObject = new URL(fetchUrl);
            const playlistId = urlObject.searchParams.get('list');
            
            // Only sanitize to a video URL if it's a video link *without* a playlist parameter.
            // If a 'list' parameter exists, we must preserve it to correctly identify the playlist.
            if (!playlistId) {
                let videoId: string | null = null;
                if (urlObject.hostname === 'youtu.be') {
                    videoId = urlObject.pathname.substring(1).split('?')[0];
                } else if (urlObject.pathname.startsWith('/shorts/')) {
                    videoId = urlObject.pathname.split('/shorts/')[1];
                } else {
                    videoId = urlObject.searchParams.get('v');
                }

                if (videoId) {
                    fetchUrl = `https://www.youtube.com/watch?v=${videoId}`;
                }
            }
        } catch (e) { console.warn("Could not parse or sanitize YouTube URL, proceeding with original.", e); }
    }
    
    const isBilibiliUrl = url.includes('bilibili.com');
    const isYouTube = fetchUrl.includes('youtube.com');
    const feedType: FeedType = isYouTube ? 'youtube' : 'rss';

    // Special handling for Reddit URLs to directly access the .rss feed
    if (/reddit\.com\/r\//.test(fetchUrl) && !fetchUrl.endsWith('.rss')) {
        try {
            const urlObject = new URL(fetchUrl);
            let path = urlObject.pathname;
            if (path.endsWith('/')) path = path.slice(0, -1);
            fetchUrl = `${urlObject.origin}${path}.rss`;
        } catch (e) { console.warn("Could not parse Reddit URL, proceeding with original.", e); }
    }

    let content: string;
    let effectiveUrl = url;
    const parser = new DOMParser();
    let doc: Document;
    let pageIconUrl: string | null = null;
    let discoveredChannelId: string | null = null;

    if (isBilibiliUrl) {
        const { content: biliContent, discoveredUrl } = await fetchBilibiliRssViaRssHub(url, onProxyAttempt, disabledProxies, proxyStats);
        content = biliContent;
        if (discoveredUrl) effectiveUrl = discoveredUrl;
        doc = parser.parseFromString(content, 'application/xml');
    } else if (isYouTube) {
        const { content: ytContent, discoveredUrl, pageIconUrl: iconFromPage, discoveredChannelId: ytChannelId } = await fetchYouTubeRssViaInvidious(fetchUrl, onProxyAttempt, disabledProxies, proxyStats);
        content = ytContent;
        if (discoveredUrl) effectiveUrl = discoveredUrl;
        if (iconFromPage) pageIconUrl = iconFromPage;
        discoveredChannelId = ytChannelId;
        doc = parser.parseFromString(content, 'application/xml');
    } else {
        content = await fetchViaProxy(fetchUrl, feedType, onProxyAttempt, disabledProxies, proxyStats);
        doc = parser.parseFromString(content, 'application/xml');
    }

    const parserError = doc.querySelector('parsererror');

    if (parserError) {
        if (isYouTube) {
             throw new Error(`The Invidious instance returned an invalid feed. The content might be unavailable or private.`);
        }
        try {
            const htmlDoc = parser.parseFromString(content, 'text/html');
            const ogImageEl = htmlDoc.querySelector('meta[property="og:image"]');
            if (ogImageEl?.getAttribute('content')) pageIconUrl = ogImageEl.getAttribute('content');
            else {
                const iconLinkEl = htmlDoc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
                if (iconLinkEl?.getAttribute('href')) {
                    try { pageIconUrl = new URL(iconLinkEl.getAttribute('href')!, url).href; } catch (e) { console.warn(`Could not construct absolute URL for icon from ${iconLinkEl.getAttribute('href')}`, e); }
                }
            }
            
            const rssLinkTypes = ['link[type="application/rss+xml"]', 'link[type="application/atom+xml"]'];
            const rssLinkEl = htmlDoc.querySelector(rssLinkTypes.join(','));
            const foundFeedUrl = rssLinkEl?.getAttribute('href') ? new URL(rssLinkEl.getAttribute('href')!, url).href : null;

            if (foundFeedUrl) {
                if (foundFeedUrl.trim() === url.trim()) throw new Error("Found the same failing URL in HTML content. Cannot recover.");
                const newContent = await fetchViaProxy(foundFeedUrl, feedType, onProxyAttempt, disabledProxies, proxyStats);
                const newDoc = parser.parseFromString(newContent, 'application/xml');
                if (newDoc.querySelector('parsererror')) throw new Error("A fallback feed link was found, but it was also malformed.");
                doc = newDoc;
                effectiveUrl = foundFeedUrl;
            } else {
                throw new Error("Failed to parse as a feed, and no fallback RSS link was found in the content.");
            }
        } catch (discoveryError) {
            const message = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
            throw new Error(`Failed to parse as a feed: ${message}`);
        }
    }
    
    // Attempt to determine the canonical ID for the feed.
    let canonicalId: string;
    const isPlaylistUrl = isYouTube && (url.includes('playlist?list=') || url.includes('list='));

    if (isYouTube) {
        if (isPlaylistUrl) {
            // For playlists, the canonical ID is the playlist URL itself.
            const playlistId = new URL(url).searchParams.get('list');
            canonicalId = `https://www.youtube.com/playlist?list=${playlistId}`;
        } else if (discoveredChannelId) {
            // For channels, always use the discovered channel ID.
            const originalUrl = new URL(url);
            const handle = originalUrl.pathname.startsWith('/@') ? originalUrl.pathname.split('/')[1] : null;
            if (handle && !handle.startsWith('UC')) {
                 canonicalId = `https://www.youtube.com/${handle}`;
            } else {
                 canonicalId = `https://www.youtube.com/channel/${discoveredChannelId}/home`;
            }
        } else {
            // Fallback for YouTube URLs that are not channels or playlists (should be rare)
            canonicalId = effectiveUrl;
        }
    } else if (isBilibiliUrl) {
        canonicalId = getBilibiliCanonicalUrl(url) || url;
    } else {
        // For standard RSS, use the feed's self-reported link if it's a valid URL, otherwise fall back to the effective URL.
        const feedLink = findText(doc, ['link']);
        let isValidFeedLink = false;
        if (feedLink) {
            try { new URL(feedLink); isValidFeedLink = true; } catch (e) { isValidFeedLink = false; }
        }
        canonicalId = isValidFeedLink ? feedLink! : effectiveUrl;
    }

    const feedTitle = decodeHtmlEntities(findText(doc, ['title']) || defaultTitle || url);
    const feedDescription = findText(doc, ['description', 'subtitle']);
    let feedIcon = findText(doc, ['icon', 'logo']);

    // Specific workaround for Reddit's outdated icon URL in their RSS feeds.
    if (feedIcon === 'https://www.redditstatic.com/icon.png') {
        feedIcon = 'https://www.redditstatic.com/desktop2x/img/favicon/favicon-32x32.png';
    }
    
    const baseArticles = Array.from(doc.querySelectorAll('item, entry')).slice(0, numArticles).map((item): Article => {
        const title = decodeHtmlEntities(findText(item, ['title']) || 'Untitled');
        const mediaDescription = findHtml(item, ['media:description']);
        const description = decodeHtmlEntities(findHtml(item, ['description', 'summary']));
        const contentEncoded = decodeHtmlEntities(findHtml(item, ['content:encoded', 'content']));
        let content = mediaDescription || contentEncoded || description;
        
        let link = findAttr(item, ['link'], 'href') || findText(item, ['link']);
        const pubDate = findText(item, ['pubDate', 'published', 'updated']);
        let pubDateTimestamp: number | null = null;
        if (pubDate) {
            try { pubDateTimestamp = new Date(pubDate).getTime(); } catch(e) { /* ignore invalid dates */ }
        }

        let id = findText(item, ['guid', 'id']) || link || `${feedTitle}-${title}-${pubDate}`;
        const imageUrl = getImage(item, content);

        const { height: videoHeight, width: videoWidth, duration: videoDuration } = findMediaContentAttrs(item);
        const mediaStatistics = findElement(item, ['media:statistics']);
        const views = mediaStatistics?.getAttribute('views');

        if (isYouTube) {
            const videoId = findText(item, ['yt:videoId']);
            if (videoId) {
                link = `https://www.youtube.com/watch?v=${videoId}`;
                id = videoId;
            } else {
                const idTag = findText(item, ['guid', 'id']);
                if (idTag && idTag.includes('yt:video:')) {
                    const extractedVideoId = idTag.split('yt:video:')[1];
                    if (extractedVideoId) {
                        link = `https://www.youtube.com/watch?v=${extractedVideoId}`;
                        id = extractedVideoId;
                    }
                }
            }
            // For YouTube videos, the description from Invidious is the full content.
            // If it's empty, set to a single space to prevent on-demand fetching.
            if (!content.trim()) {
                content = ' ';
            }
        }
        
        return {
            feedId: canonicalId,
            id, title, link, description, pubDate, pubDateTimestamp, imageUrl, content, feedTitle,
            isVideo: (isYouTube || isBilibiliUrl) || (videoHeight !== undefined && videoWidth !== undefined),
            hasIframe: isBilibiliUrl,
            views: views ? parseInt(views, 10) : null,
            duration: videoDuration
        };
    });
    
    // A critical validation step to ensure that when adding a recommended feed, we get the right one.
    // If a defaultTitle is provided (from a recommendation), and the fetched title doesn't match,
    // it indicates the proxy/service might have resolved to the wrong channel.
    if (defaultTitle && defaultTitle !== feedTitle && Math.abs(defaultTitle.length - feedTitle.length) > 5) {
        // Simple length check helps avoid false positives from minor title variations (e.g., " vs. ')
        throw new Error(`Title mismatch: Expected something like "${defaultTitle}", but got "${feedTitle}". The content provider may have returned an incorrect feed. Please try another proxy or service if this persists.`);
    }

    let feedChannelUrl: string | undefined = undefined;
    if (isPlaylistUrl) {
        const authorEl = findElement(doc, ['author']);
        if (authorEl) {
            const authorUri = findText(authorEl, ['uri']);
            if (authorUri) {
                try {
                    // Invidious links are relative to the instance
                    const urlObject = new URL(authorUri, effectiveUrl);
                    if (urlObject.pathname.startsWith('/channel/')) {
                        const channelId = urlObject.pathname.split('/channel/')[1];
                        feedChannelUrl = `https://www.youtube.com/channel/${channelId}`;
                    }
                } catch (e) { console.warn('Could not parse author uri for playlist channel link', e); }
            }
        }
    }

    return {
        id: canonicalId,
        url: canonicalId, // Always store the canonical URL for reliable refreshing.
        title: feedTitle,
        description: feedDescription || undefined,
        items: baseArticles,
        iconUrl: pageIconUrl || feedIcon,
        maxArticles: numArticles,
        isPlaylist: isPlaylistUrl,
        channelUrl: feedChannelUrl,
    };
};