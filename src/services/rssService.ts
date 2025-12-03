import type { Feed, Article, ProxyAttemptCallback, ProxyStats, FeedType } from '../types';
import { fetchViaProxy } from './proxyService';
import { INVIDIOUS_INSTANCES, RSSHUB_INSTANCES } from './proxyService';

// --- Helper for YouTube fetching via Invidious ---
const fetchYouTubeRssViaInvidious = async (
  youtubeUrl: string,
  onProxyAttempt?: ProxyAttemptCallback,
  disabledProxies?: Set<string>,
  proxyStats?: ProxyStats
): Promise<{
  content: string;
  discoveredUrl: string | null;
  pageIconUrl: string | null;
  discoveredChannelId: string | null;
}> => {
  let channelId: string | null = null;
  let playlistId: string | null = null;
  let pageIconUrl: string | null = null;
  const parser = new DOMParser();

  try {
    const urlObject = new URL(youtubeUrl);
    playlistId = urlObject.searchParams.get('list');
  } catch (e) {
    /* ignore, will fallback to HTML fetch */
  }

  // For ANY YouTube URL (channel, video, playlist), always fetch the HTML first to get the best icon and canonical ID.
  const htmlContent = await fetchViaProxy(
    youtubeUrl,
    'youtube',
    onProxyAttempt,
    disabledProxies,
    proxyStats
  );
  const htmlDoc = parser.parseFromString(htmlContent, 'text/html');

  // --- Robust Icon Extraction ---
  const initialDataScript = Array.from(htmlDoc.querySelectorAll('script')).find(script =>
    script.textContent?.includes('var ytInitialData =')
  );
  if (initialDataScript?.textContent) {
    const match = initialDataScript.textContent.match(/var ytInitialData = (\{.*?\});/s);
    if (match?.[1]) {
      try {
        const initialData = JSON.parse(match[1]);
        const avatarThumbnails =
          initialData?.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails ||
          initialData?.metadata?.channelMetadataRenderer?.avatar?.thumbnails ||
          initialData?.sidebar?.playlistSidebarRenderer?.items?.[0]
            ?.playlistSidebarPrimaryInfoRenderer?.thumbnailRenderer?.playlistVideoThumbnailRenderer
            ?.thumbnail?.thumbnails;

        if (avatarThumbnails && avatarThumbnails.length > 0) {
          pageIconUrl = avatarThumbnails[avatarThumbnails.length - 1].url;
        }
      } catch (e) {
        console.warn('Failed to parse ytInitialData for icon', e);
      }
    }
  }

  if (!pageIconUrl) {
    const ogImageEl = htmlDoc.querySelector('meta[property="og:image"]');
    if (ogImageEl?.getAttribute('content')) pageIconUrl = ogImageEl.getAttribute('content');
  }

  // --- Robust Channel ID Extraction ---
  const canonicalLink = htmlDoc.querySelector('link[rel="canonical"]');
  if (canonicalLink) {
    const canonicalUrl = canonicalLink.getAttribute('href');
    if (canonicalUrl) {
      const match = canonicalUrl.match(/\/channel\/(UC[\w-]{22})/);
      if (match && match[1]) channelId = match[1];
    }
  }

  if (!channelId) {
    const metaTag = htmlDoc.querySelector('meta[itemprop="channelId"]');
    if (metaTag) channelId = metaTag.getAttribute('content');
  }

  if (!channelId) {
    const channelIdMatch = htmlContent.match(/"channelId":"(UC[\w-]{22})"/);
    if (channelIdMatch?.[1]) channelId = channelIdMatch[1];
  }

  if (!channelId && !playlistId) {
    throw new Error('Could not discover a Channel or Playlist ID from the provided YouTube URL.');
  }

  // Now fetch feed from Invidious
  let lastError: unknown = null;
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const invidiousFeedUrl = playlistId
        ? `${instance}/feed/playlist/${playlistId}`
        : `${instance}/feed/channel/${channelId!}`;

      const content = await fetchViaProxy(
        invidiousFeedUrl,
        'youtube',
        onProxyAttempt,
        disabledProxies,
        proxyStats
      );
      if (content) {
        const doc = parser.parseFromString(content, 'application/xml');
        if (!doc.querySelector('parsererror')) {
          return {
            content,
            discoveredUrl: invidiousFeedUrl,
            pageIconUrl,
            discoveredChannelId: channelId,
          };
        }
        throw new Error('Invidious instance returned non-XML content.');
      }
    } catch (error) {
      lastError = error;
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

    if (
      hostname.includes('bilibili.com') &&
      (hostname === 'space.bilibili.com' || pathname.startsWith('/space/'))
    ) {
      const userIdMatch = pathname.match(/(\d+)/);
      if (userIdMatch && userIdMatch[1]) {
        return `/bilibili/user/video/${userIdMatch[1]}`;
      }
    }

    const categoryMatch = pathname.match(/^\/(?:c|v\/popular)\/([a-zA-Z]+)/);
    if (categoryMatch && categoryMatch[1]) {
      const categoryName = categoryMatch[1].toLowerCase();
      const categoryMap: Record<string, number> = {
        cinephile: 181,
        cinema: 181,
        anime: 1,
        music: 3,
        tech: 188,
        food: 211,
        life: 160,
        game: 4,
        ent: 5,
        movie: 181,
        dance: 129,
        knowledge: 36,
        sports: 234,
        car: 223,
        fashion: 155,
        animal: 217,
        kichiku: 119,
      };
      if (categoryMap[categoryName]) return `/bilibili/partion/${categoryMap[categoryName]}`;
    }

    const partitionMatch = pathname.match(/\/v\/popular\/partition\/(\d+)/);
    if (partitionMatch && partitionMatch[1]) {
      return `/bilibili/partion/${partitionMatch[1]}`;
    }

    return null;
  } catch (e) {
    console.warn('Could not parse Bilibili URL to create RSSHub path.', e);
    return null;
  }
};

const fetchBilibiliRssViaRssHub = async (
  bilibiliUrl: string,
  onProxyAttempt?: ProxyAttemptCallback,
  disabledProxies?: Set<string>,
  proxyStats?: ProxyStats
): Promise<{ content: string; discoveredUrl: string | null }> => {
  const rssHubPath = getBilibiliRssHubPath(bilibiliUrl);

  if (!rssHubPath) {
    throw new Error(
      'Could not convert the provided Bilibili URL into a valid feed URL. Please check if the URL format is supported.'
    );
  }

  const parser = new DOMParser();
  let lastError: unknown = null;
  for (const instance of RSSHUB_INSTANCES) {
    try {
      const rsshubUrl = `${instance}${rssHubPath}`;

      const content = await fetchViaProxy(
        rsshubUrl,
        'rss',
        onProxyAttempt,
        disabledProxies,
        proxyStats
      );

      const doc = parser.parseFromString(content, 'application/xml');
      if (!doc.querySelector('parsererror')) {
        return { content, discoveredUrl: rsshubUrl };
      }
      throw new Error(`RSSHub instance ${instance} returned invalid XML content.`);
    } catch (error) {
      lastError = error;
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `All RSSHub instances failed to fetch the Bilibili feed. Last error: ${errorMessage}`
  );
};

const getBilibiliCanonicalUrl = (bilibiliUrl: string): string | null => {
  try {
    const urlObject = new URL(bilibiliUrl);
    const hostname = urlObject.hostname;
    const pathname = urlObject.pathname;

    if (
      hostname.includes('bilibili.com') &&
      (hostname === 'space.bilibili.com' || pathname.startsWith('/space/'))
    ) {
      const userIdMatch = pathname.match(/(\d+)/);
      if (userIdMatch && userIdMatch[1]) {
        return `https://space.bilibili.com/${userIdMatch[1]}`;
      }
    }
  } catch (e) {
    console.warn('Could not parse Bilibili URL for canonicalization.', e);
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
  const rawText = el?.textContent?.trim() || null;
  if (!rawText) return null;
  return rawText.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
};

const findHtml = (element: Element, tags: string[]): string => {
  const el = findElement(element, tags);
  if (!el) return '';

  const serializer = new XMLSerializer();
  let innerContent = '';
  for (const child of Array.from(el.childNodes)) {
    innerContent += serializer.serializeToString(child);
  }

  const rawHtml = innerContent.trim() || el.textContent || '';
  return rawHtml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
};

const findAttr = (element: Element, tags: string[], attr: string): string | null => {
  const el = findElement(element, tags);
  if (el?.hasAttribute(attr)) return el.getAttribute(attr);
  return null;
};

const findMediaContentAttrs = (
  element: Element
): { height?: number; width?: number; duration?: number } => {
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
  const mediaContent = item.querySelector(
    'media\\:content[medium="image"], content[medium="image"]'
  );
  if (mediaContent?.getAttribute('url')) return mediaContent.getAttribute('url');
  const enclosure = item.querySelector('enclosure[type^="image"]');
  if (enclosure?.getAttribute('url')) return enclosure.getAttribute('url');

  if (htmlContent) {
    try {
      const contentDoc = new DOMParser().parseFromString(htmlContent, 'text/html');
      const img = contentDoc.querySelector('img');
      if (img && img.src && (!img.src.startsWith('data:image/') || img.src.length > 200)) {
        return img.dataset.src || img.src;
      }
    } catch (e) {
      console.error('Error parsing HTML content for image:', e);
    }
  }
  return null;
};

const decodeHtmlEntities = (text: string | null): string => {
  if (!text) return '';
  try {
    const textarea = document.createElement('textarea');
    let currentText = text;
    // Loop to handle multiple layers of encoding (e.g., &amp;lt;p&amp;gt;)
    while (true) {
      textarea.innerHTML = currentText;
      const decodedText = textarea.value;
      if (decodedText === currentText) {
        break;
      }
      currentText = decodedText;
    }
    return currentText;
  } catch (e) {
    console.error('Could not decode HTML entities, returning original text.', e);
    return text;
  }
};

export const fetchAndParseRss = async (
  url: string,
  defaultTitle?: string,
  onProxyAttempt?: ProxyAttemptCallback,
  disabledProxies?: Set<string>,
  proxyStats?: ProxyStats,
  maxArticles?: number
): Promise<Feed> => {
  if (!url) throw new Error('URL cannot be empty.');
  if (/youtube\.com\/feed\/(subscriptions|history)/.test(url)) {
    throw new Error(
      'This looks like a personal YouTube page (e.g., Subscriptions or History). Public channel or playlist links are supported.'
    );
  }

  const numArticles = maxArticles ?? 10000;
  let fetchUrl = url;

  if (fetchUrl.includes('youtube.com') || fetchUrl.includes('youtu.be')) {
    fetchUrl = fetchUrl.replace('m.youtube.com', 'www.youtube.com');
    try {
      const urlObject = new URL(fetchUrl);
      const playlistId = urlObject.searchParams.get('list');

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
    } catch (e) {
      console.warn('Could not parse or sanitize YouTube URL, proceeding with original.', e);
    }
  }

  const isBilibiliUrl = url.includes('bilibili.com');
  const isYouTube = fetchUrl.includes('youtube.com');
  const feedType: FeedType = isYouTube ? 'youtube' : 'rss';

  if (/reddit\.com\/r\//.test(fetchUrl) && !fetchUrl.endsWith('.rss')) {
    try {
      const urlObject = new URL(fetchUrl);
      let path = urlObject.pathname;
      if (path.endsWith('/')) path = path.slice(0, -1);
      fetchUrl = `${urlObject.origin}${path}.rss`;
    } catch (e) {
      console.warn('Could not parse Reddit URL, proceeding with original.', e);
    }
  }

  let content: string;
  let effectiveUrl = url;
  const parser = new DOMParser();
  let doc: Document;
  let pageIconUrl: string | null = null;
  let discoveredChannelId: string | null = null;

  if (isBilibiliUrl) {
    const { content: biliContent, discoveredUrl } = await fetchBilibiliRssViaRssHub(
      url,
      onProxyAttempt,
      disabledProxies,
      proxyStats
    );
    content = biliContent;
    if (discoveredUrl) effectiveUrl = discoveredUrl;
    doc = parser.parseFromString(content, 'application/xml');
  } else if (isYouTube) {
    const {
      content: ytContent,
      discoveredUrl,
      pageIconUrl: iconFromPage,
      discoveredChannelId: ytChannelId,
    } = await fetchYouTubeRssViaInvidious(fetchUrl, onProxyAttempt, disabledProxies, proxyStats);
    content = ytContent;
    if (discoveredUrl) effectiveUrl = discoveredUrl;
    if (iconFromPage) pageIconUrl = iconFromPage;
    discoveredChannelId = ytChannelId;
    doc = parser.parseFromString(content, 'application/xml');
  } else {
    const responseText = await fetchViaProxy(
      fetchUrl,
      feedType,
      onProxyAttempt,
      disabledProxies,
      proxyStats
    );

    if (
      (responseText.includes('<title>corsproxy.io</title>') &&
        responseText.includes('Could not connect to the origin.')) ||
      (responseText.includes('<title>cors.eu.org</title>') &&
        responseText.includes('Failed to connect'))
    ) {
      throw new Error(
        'Failed to fetch content. The origin server may be down or blocking the proxy.'
      );
    }

    content = responseText;
    doc = parser.parseFromString(content, 'application/xml');
  }

  const parserError = doc.querySelector('parsererror');

  if (parserError) {
    if (isYouTube) {
      throw new Error(
        `The Invidious instance returned an invalid feed. The content might be unavailable or private.`
      );
    }
    try {
      const htmlDoc = parser.parseFromString(content, 'text/html');
      const ogImageEl = htmlDoc.querySelector('meta[property="og:image"]');
      if (ogImageEl?.getAttribute('content')) pageIconUrl = ogImageEl.getAttribute('content');
      else {
        const iconLinkEl = htmlDoc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
        if (iconLinkEl?.getAttribute('href')) {
          try {
            pageIconUrl = new URL(iconLinkEl.getAttribute('href')!, url).href;
          } catch (e) {
            console.warn(
              `Could not construct absolute URL for icon from ${iconLinkEl.getAttribute('href')}`,
              e
            );
          }
        }
      }

      const rssLinkTypes = [
        'link[type="application/rss+xml"]',
        'link[type="application/atom+xml"]',
      ];
      const rssLinkEl = htmlDoc.querySelector(rssLinkTypes.join(','));
      const foundFeedUrl = rssLinkEl?.getAttribute('href')
        ? new URL(rssLinkEl.getAttribute('href')!, url).href
        : null;

      if (foundFeedUrl) {
        if (foundFeedUrl.trim() === url.trim())
          throw new Error('Found the same failing URL in HTML content. Cannot recover.');
        const newContent = await fetchViaProxy(
          foundFeedUrl,
          feedType,
          onProxyAttempt,
          disabledProxies,
          proxyStats
        );
        const newDoc = parser.parseFromString(newContent, 'application/xml');
        if (newDoc.querySelector('parsererror'))
          throw new Error('A fallback feed link was found, but it was also malformed.');
        doc = newDoc;
        effectiveUrl = foundFeedUrl;
      } else {
        throw new Error(
          'Failed to parse as a feed, and no fallback RSS link was found in the content.'
        );
      }
    } catch (discoveryError) {
      const message =
        discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
      throw new Error(`Failed to parse as a feed: ${message}`);
    }
  }

  let canonicalId: string;
  const isPlaylistUrl = isYouTube && (url.includes('playlist?list=') || url.includes('list='));

  if (isYouTube) {
    if (isPlaylistUrl) {
      const playlistId = new URL(url).searchParams.get('list');
      canonicalId = `https://www.youtube.com/playlist?list=${playlistId}`;
    } else if (discoveredChannelId) {
      const originalUrl = new URL(url);
      const handle = originalUrl.pathname.startsWith('/@')
        ? originalUrl.pathname.split('/')[1]
        : null;
      if (handle && !handle.startsWith('UC')) {
        canonicalId = `https://www.youtube.com/${handle}`;
      } else {
        canonicalId = `https://www.youtube.com/channel/${discoveredChannelId}/home`;
      }
    } else {
      canonicalId = effectiveUrl;
    }
  } else if (isBilibiliUrl) {
    canonicalId = getBilibiliCanonicalUrl(url) || url;
  } else {
    const atomSelfLinkEl = Array.from(
      doc.querySelectorAll('link[rel="self"], atom\\:link[rel="self"]')
    ).find(link => link.getAttribute('rel') === 'self');
    const selfHref = atomSelfLinkEl?.getAttribute('href');

    if (selfHref) {
      try {
        // Resolve relative URL against the effective URL of the feed
        canonicalId = new URL(selfHref, effectiveUrl).href;
      } catch (e) {
        // Fallback if selfHref is invalid
        canonicalId = effectiveUrl;
      }
    } else {
      // If no self link, the effective URL we fetched is the best source of truth.
      canonicalId = effectiveUrl;
    }
  }

  const channelEl = doc.querySelector('channel, feed');

  let channelTitleText: string | null = null;
  if (channelEl) {
    const titleNode = Array.from(channelEl.children).find(
      child => child.tagName.toLowerCase().split(':').pop() === 'title'
    );
    if (titleNode && titleNode.textContent) {
      channelTitleText = titleNode.textContent
        .trim()
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .trim();
    }
  }

  const feedTitle = decodeHtmlEntities(
    channelTitleText || findText(channelEl || doc, ['title']) || defaultTitle || url
  );
  const feedDescription = findText(channelEl || doc, ['description', 'subtitle']);
  let feedIcon = findText(channelEl || doc, ['icon', 'logo']);

  if (feedIcon === 'https://www.redditstatic.com/icon.png') {
    feedIcon = 'https://www.redditstatic.com/desktop2x/img/favicon/favicon-32x32.png';
  }

  const baseArticles = Array.from(doc.querySelectorAll('item, entry'))
    .slice(0, numArticles)
    .map((item): Article => {
      const title = decodeHtmlEntities(findText(item, ['title']) || 'Untitled');

      let content = '';
      let descriptionForCard = '';
      let imageUrl: string | null = null;

      const rawContentHtml = findHtml(item, ['content:encoded', 'content']);
      const rawDescriptionHtml = findHtml(item, ['description', 'summary']);
      const mediaDescriptionHtml = isYouTube ? findHtml(item, ['media:description']) : null;

      // Determine main content: prefer content:encoded, then media:description, then description.
      let potentialContent: string | null = null;
      if (isYouTube && mediaDescriptionHtml) {
        potentialContent = mediaDescriptionHtml.replace(/\n/g, '<br />');
      } else {
        potentialContent = rawContentHtml || rawDescriptionHtml;
      }

      // Decode HTML entities only if content appears to be encoded (has &lt; but not <).
      // This handles feeds that entity-encode their HTML without setting a `type="html"` attribute.
      if (
        potentialContent &&
        !potentialContent.includes('<') &&
        potentialContent.includes('&lt;')
      ) {
        content = decodeHtmlEntities(potentialContent);
      } else {
        content = potentialContent || '';
      }

      // Final cleanup for body tags that sometimes appear in feeds
      if (content && content.trim().toLowerCase().includes('<body')) {
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch && bodyMatch[1]) {
          content = bodyMatch[1];
        }
      }

      // For the card description, we always want plain text.
      // Use description first, as it's often a summary. If not, create from content.
      let textForDescription = findText(item, ['description', 'summary']);
      if (!textForDescription && content) {
        try {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = content;
          textForDescription = tempDiv.textContent || tempDiv.innerText;
        } catch (e) {
          console.warn('Could not parse content for description fallback', e);
          textForDescription = '';
        }
      }
      descriptionForCard = decodeHtmlEntities(textForDescription || '');

      imageUrl = getImage(item, content);

      let link = findAttr(item, ['link'], 'href') || findText(item, ['link']);
      const pubDate = findText(item, ['pubDate', 'published', 'updated']);
      let pubDateTimestamp: number | null = null;
      if (pubDate) {
        try {
          pubDateTimestamp = new Date(pubDate).getTime();
        } catch (e) {
          /* ignore invalid dates */
        }
      }

      let id = findText(item, ['guid', 'id']) || link || `${feedTitle}-${title}-${pubDate}`;
      const {
        height: videoHeight,
        width: videoWidth,
        duration: videoDuration,
      } = findMediaContentAttrs(item);
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
        if (!content?.trim()) {
          content = ' ';
        }
      }

      return {
        feedId: canonicalId,
        id,
        title,
        link,
        description: descriptionForCard || '',
        pubDate,
        pubDateTimestamp,
        imageUrl,
        content: content || '',
        feedTitle,
        isVideo:
          isYouTube || isBilibiliUrl || (videoHeight !== undefined && videoWidth !== undefined),
        hasIframe: isBilibiliUrl,
        views: views ? parseInt(views, 10) : null,
        duration: videoDuration,
      };
    });

  let feedChannelUrl: string | undefined = undefined;
  if (isYouTube && discoveredChannelId) {
    feedChannelUrl = `https://www.youtube.com/channel/${discoveredChannelId}`;
  }

  return {
    id: canonicalId,
    url: canonicalId,
    title: feedTitle,
    description: feedDescription || undefined,
    items: baseArticles,
    iconUrl: pageIconUrl || feedIcon,
    isPlaylist: isPlaylistUrl,
    channelUrl: feedChannelUrl,
    maxArticles: numArticles,
  };
};
