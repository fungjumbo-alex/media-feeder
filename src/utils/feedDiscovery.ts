/**
 * RSS Feed Auto-Discovery Utility
 *
 * Given a regular website URL, discovers any linked RSS/Atom/JSON feeds
 * by parsing the page's <link rel="alternate"> tags and probing common
 * feed paths as a fallback.
 */

import { fetchViaProxy } from '../services/proxyService';

export interface DiscoveredFeed {
  url: string;
  title?: string;
}

// Common feed paths to try when no <link> tags are found in the HTML
const COMMON_FEED_PATHS = [
  '/feed',
  '/rss',
  '/feed.xml',
  '/rss.xml',
  '/index.xml',
  '/atom.xml',
  '/feeds/all.atom.xml',
  '/feeds/all.rss.xml',
];

/**
 * Resolve a potentially-relative href against a base URL.
 */
const resolveUrl = (href: string, baseUrl: string): string | null => {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
};

/**
 * Lightweight fetch that returns the response text (or null on failure).
 * Uses the existing proxy infrastructure to avoid CORS issues.
 */
const fetchTextViaProxy = async (url: string): Promise<string | null> => {
  try {
    const { content } = await fetchViaProxy(url, 'rss');
    return content;
  } catch {
    return null;
  }
};

/**
 * Validate that a candidate URL actually returns something that looks like
 * a feed (XML-based or JSON Feed). We only inspect the first ~500 chars.
 */
const isValidFeedContent = (text: string): boolean => {
  const trimmed = text.trimStart().slice(0, 500);

  // XML-based feeds (RSS, Atom)
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
    return true;
  }

  // JSON Feed  – should start with `{` and contain `"version"` or `"items"`
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed.length < 500 ? text : text.slice(0, 2000));
      // JSON Feed spec requires a version field like "https://jsonfeed.org/version/1"
      if (obj.version || Array.isArray(obj.items)) return true;
    } catch {
      /* not JSON */
    }
  }

  return false;
};

/**
 * Discover RSS/Atom/JSON feeds from a given website URL.
 *
 * 1. Fetches the HTML page via the proxy.
 * 2. Parses `<link rel="alternate" type="...">` tags for known feed MIME types.
 * 3. If none found, probes common feed paths.
 * 4. Validates each candidate by fetching and checking content type.
 */
export const discoverFeeds = async (pageUrl: string): Promise<DiscoveredFeed[]> => {
  const results: DiscoveredFeed[] = [];
  const seen = new Set<string>();

  // ---- Ensure we have an absolute URL with protocol ----
  let normalizedUrl = pageUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  let baseUrl: string;
  try {
    const parsed = new URL(normalizedUrl);
    parsed.pathname = parsed.pathname === '/' ? '/' : parsed.pathname;
    baseUrl = parsed.href;
  } catch {
    return []; // not a valid URL
  }

  // ---- Step 1: Fetch the page HTML ----
  const html = await fetchTextViaProxy(baseUrl);
  if (!html) return [];

  // ---- Step 2: Parse <link rel="alternate"> tags ----
  const feedLinkTypes = [
    'application/rss+xml',
    'application/atom+xml',
    'application/json',       // JSON Feed
    'application/feed+json',  // JSON Feed (alt)
  ];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const linkElements = doc.querySelectorAll('link[rel="alternate"], link[rel="alternative"]');
  const htmlCandidates: DiscoveredFeed[] = [];

  linkElements.forEach((el) => {
    const type = (el.getAttribute('type') || '').toLowerCase().trim();
    const href = el.getAttribute('href');
    const title = el.getAttribute('title') || undefined;

    if (!href || !type) return;
    if (!feedLinkTypes.some((t) => type.includes(t))) return;

    const absoluteUrl = resolveUrl(href, baseUrl);
    if (!absoluteUrl || seen.has(absoluteUrl.toLowerCase())) return;

    seen.add(absoluteUrl.toLowerCase());
    htmlCandidates.push({ url: absoluteUrl, title });
  });

  // Validate HTML-discovered feeds
  for (const candidate of htmlCandidates) {
    const content = await fetchTextViaProxy(candidate.url);
    if (content && isValidFeedContent(content)) {
      results.push(candidate);
    }
  }

  // If we found feeds from the HTML, return them immediately
  if (results.length > 0) return results;

  // ---- Step 3: Probe common feed paths ----
  const origin = new URL(baseUrl).origin;

  const pathCandidates = COMMON_FEED_PATHS.map((p) => `${origin}${p}`);

  // Validate each candidate URL in parallel (with a concurrency limit)
  const CONCURRENCY = 3;
  for (let i = 0; i < pathCandidates.length; i += CONCURRENCY) {
    const batch = pathCandidates.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (candidateUrl) => {
        if (seen.has(candidateUrl.toLowerCase())) return null;
        seen.add(candidateUrl.toLowerCase());

        const content = await fetchTextViaProxy(candidateUrl);
        if (content && isValidFeedContent(content)) {
          // Try to extract a feed title from the XML
          let title: string | undefined;
          try {
            const xmlDoc = new DOMParser().parseFromString(content, 'application/xml');
            const titleEl =
              xmlDoc.querySelector('channel > title') ||
              xmlDoc.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'title')[0] ||
              xmlDoc.querySelector('feed > title');
            title = titleEl?.textContent?.trim() || undefined;
          } catch {
            /* ignore */
          }
          return { url: candidateUrl, title };
        }
        return null;
      }),
    );

    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value);
      }
    }
  }

  return results;
};

/**
 * Quick heuristic: does the URL look like it might be a regular website
 * (not already a feed URL, not YouTube/Bilibili, etc.)?
 */
export const isWebsiteUrl = (input: string): boolean => {
  const trimmed = input.trim();
  if (!trimmed) return false;

  // Already looks like a direct feed URL
  if (
    trimmed.endsWith('.xml') ||
    trimmed.endsWith('.rss') ||
    trimmed.endsWith('.atom') ||
    trimmed.includes('/feeds/videos.xml') ||
    trimmed.includes('.rss') ||
    trimmed.endsWith('.json')
  ) {
    return false;
  }

  // YouTube / Bilibili / Reddit / Pastebin / paste.gg / share codes
  if (
    trimmed.includes('youtube.com') ||
    trimmed.includes('youtu.be') ||
    trimmed.includes('bilibili.com') ||
    trimmed.includes('reddit.com') ||
    trimmed.includes('pastebin.com') ||
    trimmed.includes('paste.gg')
  ) {
    return false;
  }

  // Share codes (just alphanumeric, no dots)
  if (/^[a-zA-Z0-9]+$/.test(trimmed)) return false;
  // Import fragment
  if (trimmed.includes('#/import')) return false;

  // Must contain a dot (domain-like)
  if (!trimmed.includes('.')) return false;

  return true;
};
