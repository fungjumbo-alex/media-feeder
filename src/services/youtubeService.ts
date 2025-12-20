import { INVIDIOUS_INSTANCES, fetchViaProxy, PROXIES } from './proxyService';
import type {
  YouTubeSubscription,
  Feed,
  Article,
  YouTubeComment,
  TranscriptLine,
  CaptionChoice,
} from '../types';

interface InvidiousVideoDetails {
  videoId: string;
  title: string;
  description: string;
  descriptionHtml: string;
  published: number;
  author: string;
  authorId: string;
  viewCount: number;
  lengthSeconds: number;
  videoThumbnails: Array<{ quality: string; url: string }>;
}

interface YouTubeApiSubscriptionResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      resourceId: { channelId: string };
      thumbnails: {
        high?: { url: string };
        default?: { url: string };
      };
    };
  }>;
  nextPageToken?: string;
}

interface YouTubeApiPlaylistResponse {
  items: Array<{
    snippet: {
      title: string;
      description: string;
      channelId: string;
      thumbnails?: {
        medium?: { url: string };
        default?: { url: string };
      };
    };
  }>;
}

interface YouTubeApiPlaylistItemResponse {
  items: Array<{
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      resourceId: { videoId: string };
      position: number;
      thumbnails: {
        maxres?: { url: string };
        high?: { url: string };
        medium?: { url: string };
        default?: { url: string };
      };
    };
  }>;
  nextPageToken?: string;
}

interface YouTubeApiVideosResponse {
  items: Array<{
    id: string;
    contentDetails: {
      duration: string; // ISO 8601 format, e.g., "PT15M33S"
      caption?: 'true' | 'false';
    };
  }>;
}

const YOUTUBE_API_BASE = 'https://youtube.googleapis.com/youtube/v3';

/**
 * Parse ISO 8601 duration format (e.g., "PT15M33S") to seconds
 */
const parseISO8601Duration = (duration: string): number | null => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
};

/**
 * A wrapper for fetch that adds authentication and the API key, plus centralized error handling.
 */
const fetchWithAuth = async (url: string, accessToken: string, options: RequestInit = {}) => {
  try {
    const YOUTUBE_API_KEY = (window as any).process?.env?.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) {
      // The UI should prevent this call from happening, but this is a safeguard.
      throw new Error('YouTube API Key is not configured. Please set it to use this feature.');
    }

    const urlWithKey = new URL(url);
    urlWithKey.searchParams.append('key', YOUTUBE_API_KEY);

    const response = await fetch(urlWithKey.toString(), {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response;
  } catch (error) {
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        'A network error occurred. Please check your internet connection and ensure ad-blockers are not interfering with Google APIs.'
      );
    }
    throw error;
  }
};

/**
 * A centralized error handler for YouTube API calls.
 * Checks for authentication errors and throws a specific, identifiable error.
 */
const handleYouTubeError = async (response: Response, defaultMessage: string): Promise<never> => {
  // A 401 is a clear signal that the token is invalid or expired, which is recoverable by re-authenticating.
  if (response.status === 401) {
    const authError = new Error(
      'Authentication failed. Your session may have expired. Please try signing in again.'
    );
    (authError as any).isAuthError = true; // This specific flag triggers the re-auth flow in the app context.
    throw authError;
  }

  // For all other errors (including 403 Forbidden), we treat them as non-recoverable by silent re-auth.
  // This is crucial to prevent infinite loops if the user lacks permissions for a specific action (e.g., liking a video with disabled ratings).
  let errorBody;
  try {
    errorBody = await response.json();
  } catch (e) {
    // If the body can't be parsed, we can't get more details.
    const textError = await response.text().catch(() => '');
    if (textError) {
      throw new Error(`${defaultMessage}: ${textError} (Status: ${response.status})`);
    }
    throw new Error(`${defaultMessage} (Status: ${response.status})`);
  }

  const message = errorBody?.error?.message || defaultMessage;
  const reason = errorBody?.error?.errors?.[0]?.reason;
  throw new Error(reason ? `${message} (Reason: ${reason})` : message);
};

// FIX: Implement and export getYouTubeId to resolve import errors across the application.
export const getYouTubeId = (url: string | null): string | null => {
  if (!url) return null;

  // 1. Try explicit Invidious API pattern first
  if (url.includes('/api/v1/captions/')) {
    const parts = url.split('/api/v1/captions/');
    const idPart = parts[1]?.split(/[?&#]/)[0];
    if (idPart?.length === 11) return idPart;
  }

  // 2. Standard YouTube patterns (watch, shorts, embed, short url)
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/|api\/v1\/captions\/)([^#&?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) return match[2];

  // 3. Fallback: search for any 11-char string that looks like an ID if the context is right
  if (url.length === 11) return url;

  return null;
};

// FIX: Implement and export fetchYouTubeComments to resolve import error.
export const fetchYouTubeComments = async (videoId: string): Promise<YouTubeComment[]> => {
  if (!videoId) return [];
  let lastError: unknown = null;
  for (const instance of INVIDIOUS_INSTANCES.slice(0, 3)) {
    try {
      const commentsUrl = `${instance}/api/v1/comments/${videoId}`;
      const content = await fetchViaProxy(commentsUrl, 'youtube');
      const data = JSON.parse(content);
      if (data && Array.isArray(data.comments)) {
        return data.comments;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `All Invidious instances failed to fetch comments. Last error: ${errorMessage}`
    );
  }
  // If no instances worked and there was no specific error, throw a generic one.
  throw new Error('Could not fetch YouTube comments from any available source.');
};

/**
 * Fetch video durations for multiple videos in batches using YouTube Data API.
 * The YouTube API supports up to 50 video IDs per request.
 * @param videoIds Array of YouTube video IDs
 * @param accessToken Google OAuth access token
 * @returns Map of video ID to duration in seconds
 */
export const fetchVideosDuration = async (
  videoIds: string[],
  accessToken: string
): Promise<Map<string, { duration: number; hasCaption: boolean }>> => {
  const durationMap = new Map<string, { duration: number; hasCaption: boolean }>();

  if (videoIds.length === 0) {
    return durationMap;
  }

  // Process in chunks of 50 (YouTube API limit)
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    try {
      if (!accessToken) {
        continue;
      }
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${chunk.join(',')}&key=${(window as any).process?.env?.YOUTUBE_API_KEY}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        continue;
      }

      const data: YouTubeApiVideosResponse = await response.json();

      if (data.items) {
        for (const item of data.items) {
          if (item.contentDetails?.duration) {
            const durationSeconds = parseISO8601Duration(item.contentDetails.duration);
            if (durationSeconds !== null) {
              durationMap.set(item.id, {
                duration: durationSeconds,
                hasCaption: item.contentDetails.caption === 'true',
              });
            }
          }
        }
      }
    } catch (error) {
      /* ignore */
    }
  }

  return durationMap;
};

export const fetchYouTubeVideoDetails = async (
  videoId: string
): Promise<{ description: string; views: number | null }> => {
  if (!videoId) throw new Error('Video ID is required.');
  let lastError: unknown = null;
  for (const instance of INVIDIOUS_INSTANCES.slice(0, 3)) {
    try {
      const videoDetailsUrl = `${instance}/api/v1/videos/${videoId}`;
      const content = await fetchViaProxy(videoDetailsUrl, 'youtube');
      const data = JSON.parse(content);
      if (data && data.descriptionHtml) {
        return {
          description: data.descriptionHtml,
          views: data.viewCount || null,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `All Invidious instances failed to fetch video details. Last error: ${errorMessage}`
  );
};

export const likeYouTubeVideo = async (videoId: string, accessToken: string): Promise<void> => {
  if (!videoId) throw new Error('Video ID is required to like a video.');
  const url = `${YOUTUBE_API_BASE}/videos/rate?id=${videoId}&rating=like`;
  const response = await fetchWithAuth(url, accessToken, { method: 'POST' });
  if (response.status === 204) {
    // Success, no content
    return;
  }
  // If it's not a 204, something went wrong.
  await handleYouTubeError(response, 'Could not like the video.');
};

export const fetchYouTubeSubscriptions = async (
  accessToken: string
): Promise<YouTubeSubscription[]> => {
  const allSubscriptions: YouTubeSubscription[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const url = new URL(`${YOUTUBE_API_BASE}/subscriptions`);
    url.searchParams.append('part', 'snippet');
    url.searchParams.append('mine', 'true');
    url.searchParams.append('maxResults', '50');
    if (nextPageToken) {
      url.searchParams.append('pageToken', nextPageToken);
    }

    const response = await fetchWithAuth(url.toString(), accessToken);
    if (!response.ok) {
      await handleYouTubeError(response, 'Could not fetch YouTube subscriptions.');
    }

    const data = (await response.json()) as YouTubeApiSubscriptionResponse;
    const subs = (data.items || []).map(
      (item): YouTubeSubscription => ({
        id: item.id,
        channelId: item.snippet.resourceId.channelId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnailUrl:
          item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || '',
      })
    );
    allSubscriptions.push(...subs);

    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return allSubscriptions;
};

export const fetchPlaylistAsFeed = async (
  playlistId: string,
  accessToken: string
): Promise<Feed> => {
  // 1. Fetch playlist details for title, description, icon
  const playlistDetailsUrl = `${YOUTUBE_API_BASE}/playlists?part=snippet&id=${playlistId}`;
  const playlistDetailsResponse = await fetchWithAuth(playlistDetailsUrl, accessToken);
  if (!playlistDetailsResponse.ok) {
    await handleYouTubeError(playlistDetailsResponse, 'Could not fetch YouTube playlist details.');
  }
  const playlistDetailsData = (await playlistDetailsResponse.json()) as YouTubeApiPlaylistResponse;
  if (!playlistDetailsData.items || playlistDetailsData.items.length === 0) {
    throw new Error('Playlist not found or it is private.');
  }
  const playlistSnippet = playlistDetailsData.items[0].snippet;

  // 2. Fetch all playlist items (paginated)
  const allItems: Article[] = [];
  let nextPageToken: string | undefined = undefined;
  do {
    const itemsUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
    itemsUrl.searchParams.append('part', 'snippet,contentDetails');
    itemsUrl.searchParams.append('playlistId', playlistId);
    itemsUrl.searchParams.append('maxResults', '50');
    if (nextPageToken) {
      itemsUrl.searchParams.append('pageToken', nextPageToken);
    }

    const itemsResponse = await fetchWithAuth(itemsUrl.toString(), accessToken);
    if (!itemsResponse.ok) {
      await handleYouTubeError(itemsResponse, 'Could not fetch YouTube playlist items.');
    }

    const itemsData = (await itemsResponse.json()) as YouTubeApiPlaylistItemResponse;
    const items = (itemsData.items || []).map((item): Article => {
      const snippet = item.snippet;
      const videoId = snippet.resourceId.videoId;
      return {
        feedId: `https://www.youtube.com/playlist?list=${playlistId}`,
        id: videoId,
        title: snippet.title,
        link: `https://www.youtube.com/watch?v=${videoId}`,
        description: snippet.description,
        pubDate: snippet.publishedAt,
        pubDateTimestamp: new Date(snippet.publishedAt).getTime(),
        imageUrl:
          snippet.thumbnails.maxres?.url ||
          snippet.thumbnails.high?.url ||
          snippet.thumbnails.medium?.url ||
          snippet.thumbnails.default?.url ||
          null,
        content: snippet.description,
        feedTitle: playlistSnippet.title,
        isVideo: true,
        order: snippet.position,
      };
    });
    allItems.push(...items);
    nextPageToken = itemsData.nextPageToken;
  } while (nextPageToken);

  // Sort by position
  allItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // 3. Fetch video durations AND caption info for all items
  const videoIds = allItems.map(item => item.id);
  const durationsAndCaptions = await fetchVideosDuration(videoIds, accessToken);

  // Update items with duration and hasCaption
  const itemsWithDuration = allItems.map(item => {
    const data = durationsAndCaptions.get(item.id);
    return {
      ...item,
      duration: data?.duration || null,
      hasCaption: data?.hasCaption || false,
    };
  });

  return {
    id: `https://www.youtube.com/playlist?list=${playlistId}`,
    url: `https://www.youtube.com/playlist?list=${playlistId}`,
    title: playlistSnippet.title,
    description: playlistSnippet.description,
    items: itemsWithDuration,
    iconUrl: playlistSnippet.thumbnails?.medium?.url || playlistSnippet.thumbnails?.default?.url,
    maxArticles: itemsWithDuration.length,
    isPlaylist: true,
    channelUrl: `https://www.youtube.com/channel/${playlistSnippet.channelId}`,
  };
};

export const fetchSingleYouTubeVideoAsArticle = async (videoId: string): Promise<Article> => {
  let lastError: unknown = null;
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const videoUrl = `${instance}/api/v1/videos/${videoId}`;
      const content = await fetchViaProxy(videoUrl, 'youtube');
      const data = JSON.parse(content) as InvidiousVideoDetails;
      if (data && data.videoId) {
        return {
          feedId: `https://www.youtube.com/channel/${data.authorId}`,
          id: data.videoId,
          title: data.title,
          link: `https://www.youtube.com/watch?v=${data.videoId}`,
          description: data.description,
          pubDate: new Date(data.published * 1000).toISOString(),
          pubDateTimestamp: data.published * 1000,
          imageUrl: `https://i.ytimg.com/vi/${data.videoId}/hqdefault.jpg`,
          content: data.descriptionHtml,
          feedTitle: data.author,
          isVideo: true,
          views: data.viewCount,
          duration: data.lengthSeconds,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `All Invidious instances failed to fetch video details. Last error: ${errorMessage}`
  );
};

// Replaced TranscriptSnippet with TranscriptLine from types

const parseVTT = (vttText: string): TranscriptLine[] => {
  const lines = vttText.split(/\r?\n/);
  const snippets: TranscriptLine[] = [];
  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  let currentText: string[] = [];

  // Helper to parse timestamp to seconds
  // Format: HH:MM:SS.mmm or MM:SS.mmm
  const parseTimestamp = (timestamp: string): number => {
    const parts = timestamp.split(':');
    let seconds = 0;
    if (parts.length === 3) {
      seconds += parseInt(parts[0], 10) * 3600;
      seconds += parseInt(parts[1], 10) * 60;
      seconds += parseFloat(parts[2]);
    } else if (parts.length === 2) {
      seconds += parseInt(parts[0], 10) * 60;
      seconds += parseFloat(parts[1]);
    }
    return seconds;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === 'WEBVTT') continue;

    // Check for timestamp line
    // Format: 00:00:00.000 --> 00:00:00.000
    const arrowIndex = line.indexOf('-->');
    if (arrowIndex !== -1) {
      // If we have a previous snippet accumulating, push it
      if (currentStart !== null && currentEnd !== null && currentText.length > 0) {
        snippets.push({
          text: currentText.join(' ').replace(/<[^>]*>/g, ''), // Strip content tags if any
          start: currentStart,
          duration: currentEnd - currentStart,
        });
        currentText = [];
      }

      const startStr = line.substring(0, arrowIndex).trim();
      const endStr = line
        .substring(arrowIndex + 3)
        .trim()
        .split(' ')[0]; // Handle settings after timestamp
      currentStart = parseTimestamp(startStr);
      currentEnd = parseTimestamp(endStr);
      continue;
    }

    // Accumulate text
    if (currentStart !== null) {
      currentText.push(line);
    }
  }

  // Push last snippet
  if (currentStart !== null && currentEnd !== null && currentText.length > 0) {
    snippets.push({
      text: currentText.join(' ').replace(/<[^>]*>/g, ''),
      start: currentStart,
      duration: currentEnd - currentStart,
    });
  }

  return snippets;
};

export const fetchTranscript = async (url: string): Promise<TranscriptLine[]> => {
  const isYoutubeUrl = url.includes('youtube.com/') || url.includes('youtu.be/');
  const videoId = getYouTubeId(url);

  // 1. Try local backend first ONLY for YouTube URLs
  if (isYoutubeUrl) {
    try {
      console.log('[Transcript] Attempting backend fetch for YouTube URL:', url);
      const response = await fetch(`/api/transcript?t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.error) {
          console.warn(`[Transcript] Backend logic error: ${data.error}`);
        } else {
          // Standardize response format check
          const transcript =
            data.transcript || data.snippets || (Array.isArray(data) ? data : null);
          if (transcript && Array.isArray(transcript)) {
            console.log(
              `[Transcript] Found transcript in backend response (${transcript.length} lines)`
            );
            return transcript;
          }
        }
      } else {
        try {
          const errorData = await response.json();
          console.warn(
            `[Transcript] Backend failed (${response.status}): ${errorData.error || 'Unknown error'}`
          );
        } catch (e) {
          console.warn(`[Transcript] Backend failed (${response.status}). Trying fallback...`);
        }
      }
    } catch (error) {
      console.warn(`[Transcript] Backend fetch exception, trying fallback: ${error}`);
    }
  } else {
    console.log(
      '[Transcript] URL is NOT a YouTube URL, skipping backend scraper and using proxy:',
      url
    );
  }

  // 1.5 NEW: Direct YouTube Page Scrape Fallback (V13)
  if (isYoutubeUrl && videoId) {
    try {
      console.log(`[Transcript] Trying Direct YouTube Scraping for: ${videoId}`);
      const directSnippets = await scrapeYouTubePage(videoId);
      if (directSnippets && directSnippets.length > 5) {
        console.log(
          `[Transcript] Successfully scraped ${directSnippets.length} snippets directly from YouTube page.`
        );
        return directSnippets;
      }
    } catch (scrapeErr) {
      console.warn(`[Transcript] Direct scraping failed: ${scrapeErr}`);
    }
  }

  // 2. Fallback to Invidious instances
  if (!videoId) {
    // If it's already an external transcript URL (not a video URL), try fetching it via proxy directly
    if (url.includes('/api/v1/captions/') || url.includes('.vtt') || url.includes('.srt')) {
      console.log('[Transcript] URL appears to be a direct caption link, fetching via proxy...');
      try {
        const content = await fetchViaProxy(url, 'youtube');
        if (content) {
          const snippets = parseVTT(content);
          if (snippets.length > 0) return snippets;
          throw new Error('No snippets found in caption file.');
        }
        throw new Error('Empty response from caption source.');
      } catch (e) {
        throw new Error(
          `Direct caption fetch failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
    throw new Error('Could not identify Video ID or valid caption source from URL.');
  }

  console.log(`[Transcript] Starting Invidious fallback for videoId: ${videoId}`);
  let lastError: unknown = null;

  console.log(
    `%c[Build] STATUS: V14-ULTRA (20:25:48) Racing ${INVIDIOUS_INSTANCES.length} instances...`,
    'color: #00ffff; font-weight: bold;'
  );

  const shuffled = [...INVIDIOUS_INSTANCES].sort(() => Math.random() - 0.5);

  // Helper to validate if a response is HTML (indicating a block/error)
  const isHtml = (text: string) => {
    const t = text.trim().toLowerCase();
    return t.startsWith('<!doctype html') || t.startsWith('<html');
  };

  // Helper to try a single instance (returns data or throws to signal failure for race)
  const tryInstance = async (instance: string) => {
    const captionsUrl = `${instance}/api/v1/captions/${videoId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for race - increased from 12s

    try {
      const content = await fetchViaProxy(
        captionsUrl,
        'youtube',
        undefined,
        undefined,
        undefined,
        undefined,
        {
          signal: controller.signal,
        } as any
      );

      clearTimeout(timeoutId);

      if (!content || isHtml(content)) {
        throw new Error('Blocked or No Content');
      }

      const data = JSON.parse(content);
      const captionsArray = Array.isArray(data) ? data : data.captions || [];

      if (captionsArray.length === 0) throw new Error('No Captions');

      // Find English caption
      const findCaption = (lang: string) =>
        captionsArray.find((c: any) => c.language_code === lang || c.languageCode === lang) ||
        captionsArray.find((c: any) => (c.language_code || c.languageCode)?.startsWith(lang));

      const enCaption = findCaption('en') || captionsArray[0];
      if (!enCaption) throw new Error('No valid track');

      return { instance, enCaption };
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn(
        `[Transcript] Instance ${instance} FAILED: ${e instanceof Error ? e.message : String(e)}`
      );
      throw e;
    }
  };

  // Polyfill-like helper to avoid TS target version issues
  const raceAny = async <T>(promises: Promise<T>[]): Promise<T> => {
    return new Promise((resolve, reject) => {
      let rejected = 0;
      promises.forEach(p => {
        p.then(resolve).catch(() => {
          rejected++;
          if (rejected === promises.length) reject(new Error('All failed'));
        });
      });
    });
  };

  // We race in batches of 6 to find working instances faster
  const batchSize = 6;
  console.log(
    `[Transcript] Starting race with ${shuffled.length} instances in batches of ${batchSize}`
  );

  for (let i = 0; i < shuffled.length; i += batchSize) {
    const batch = shuffled.slice(i, i + batchSize);
    console.log(
      `[Transcript] Racing Batch ${Math.floor(i / batchSize) + 1}: ${batch.map(url => url.replace('https://', '')).join(', ')}`
    );

    try {
      // Race the batch to find the first working bridge
      // We wrap the race in a loop so if one winner returns empty content, we can potentially try others in the same batch
      const instancesInBatch = [...batch];

      while (instancesInBatch.length > 0) {
        try {
          // Race the remaining instances in the batch
          const { instance: winnerInstance, enCaption } = await raceAny(
            instancesInBatch.map(inst => tryInstance(inst))
          );

          console.log(
            `%c[Transcript] RACE WINNER: ${winnerInstance}`,
            'color: #00ff00; font-weight: bold;'
          );

          // Now fetch the actual content from the winner
          const captionFileUrl = enCaption.url.startsWith('http')
            ? enCaption.url
            : `${winnerInstance}${enCaption.url}`;
          console.log(`[Transcript] Fetching actual caption content from: ${captionFileUrl}`);

          const contentController = new AbortController();
          const contentTimeoutId = setTimeout(() => contentController.abort(), 25000); // 25s for content fetch

          let captionContent: string | null = null;
          try {
            captionContent = await fetchViaProxy(
              captionFileUrl,
              'youtube',
              undefined,
              undefined,
              undefined,
              undefined,
              {
                signal: contentController.signal,
              } as any
            );
          } catch (fetchErr) {
            console.warn(
              `[Transcript] Failed to fetch content from winner ${winnerInstance}: ${fetchErr}`
            );
          }

          clearTimeout(contentTimeoutId);

          if (captionContent && !isHtml(captionContent)) {
            // Handle Data URI if returned by proxy/instance
            if (captionContent.startsWith('data:')) {
              const base64Marker = ';base64,';
              const markerIndex = captionContent.indexOf(base64Marker);
              if (markerIndex !== -1) {
                const base64 = captionContent.substring(markerIndex + base64Marker.length);
                try {
                  captionContent = atob(base64);
                } catch (e) {
                  console.warn('[Transcript] Failed to decode base64 caption content', e);
                }
              } else {
                const commaIndex = captionContent.indexOf(',');
                if (commaIndex !== -1) {
                  captionContent = decodeURIComponent(captionContent.substring(commaIndex + 1));
                }
              }
            }

            const snippets = parseVTT(captionContent);
            if (snippets.length > 5) {
              // Expect at least 5 snippets for a real transcript
              console.log(
                `[Transcript] Successfully parsed ${snippets.length} snippets from ${winnerInstance}`
              );
              return snippets;
            }
            console.warn(
              `[Transcript] Parsed too few snippets (${snippets.length}) from ${winnerInstance} content.`
            );
          } else {
            const errorType = !captionContent ? 'Empty' : 'HTML/Blocked';
            console.warn(`[Transcript] ${errorType} content returned from ${winnerInstance}`);
          }

          // If we reach here, this winner failed. Remove it and try the race again with remaining.
          const winnerIndex = instancesInBatch.indexOf(winnerInstance);
          if (winnerIndex !== -1) {
            instancesInBatch.splice(winnerIndex, 1);
            console.log(
              `[Transcript] Retrying remaining ${instancesInBatch.length} instances in Batch ${Math.floor(i / batchSize) + 1}...`
            );
          } else {
            break;
          }
        } catch (raceError) {
          // If the race itself fails or winners are exhausted
          console.warn(`[Transcript] Batch race finished or failed: ${String(raceError)}`);
          break; // Move to next batch
        }
      }
    } catch (error) {
      console.warn(`[Transcript] Batch ${Math.floor(i / batchSize) + 1} processing error:`, error);
      lastError = error;
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[Transcript] FAILED after trying all sources: ${errorMessage}`);
  throw new Error(`Failed to fetch transcript from all sources. Last error: ${errorMessage}`);
};

/**
 * NEW: V13 Direct YouTube Scraper
 * Extracts ytInitialPlayerResponse from the watch page to find caption URLs.
 */
export const scrapeYouTubePage = async (videoId: string): Promise<TranscriptLine[]> => {
  // Use ucbcb=1 to bypass the cookie banner / consent page
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&ucbcb=1`;

  // Use a broad search but prioritize proxies that handle HTML well
  const html = await fetchViaProxy(watchUrl, 'youtube', undefined, undefined, undefined, [
    PROXIES[1], // App Proxy
    PROXIES[2], // AllOrigins
    PROXIES[4], // corsproxy.io
    PROXIES[5], // cors.sh
  ]);

  if (!html || !html.includes('ytInitialPlayerResponse')) {
    throw new Error('Could not find player response in YouTube HTML.');
  }

  // Extract the JSON blob
  const regex = /ytInitialPlayerResponse\s*=\s*({.+?});/s;
  const match = html.match(regex);
  if (!match) throw new Error('Failed to parse ytInitialPlayerResponse via regex.');

  let playerResponse;
  try {
    playerResponse = JSON.parse(match[1]);
  } catch (e) {
    throw new Error('Failed to parse player response JSON.');
  }

  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captions || !Array.isArray(captions) || captions.length === 0) {
    throw new Error('No caption tracks found in player response.');
  }

  // Prioritize English (manual > generated)
  const englishTrack =
    captions.find((c: any) => c.languageCode === 'en' && c.kind !== 'asr') ||
    captions.find((c: any) => c.languageCode === 'en') ||
    captions[0];

  if (!englishTrack?.baseUrl) {
    throw new Error('No suitable caption track URL found.');
  }

  // Build the VTT URL
  let vttUrl = englishTrack.baseUrl;
  if (!vttUrl.includes('fmt=vtt')) {
    vttUrl += (vttUrl.includes('?') ? '&' : '?') + 'fmt=vtt';
  }

  console.log(`[Transcript] Scraped direct VTT URL: ${vttUrl}`);
  const vttContent = await fetchViaProxy(vttUrl, 'youtube');

  if (!vttContent || vttContent.startsWith('<!doctype')) {
    throw new Error('Failed to fetch VTT content from scraped URL.');
  }

  const snippets = parseVTT(vttContent);
  return snippets;
};

export const getTranscriptChoices = async (videoId: string): Promise<CaptionChoice[]> => {
  if (!videoId) return [];
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Method 1: Backend
  try {
    const snippets = await fetchTranscript(url);
    if (snippets && snippets.length > 0) {
      return [
        {
          label: 'English (Backend)',
          language_code: 'en',
          url: `backend-transcript:${videoId}`,
        },
      ];
    }
  } catch (e) {
    console.warn(`[Transcript] getTranscriptChoices: Backend attempt failed: ${e}`);
  }

  // Method 2: Invidious list (Extended search)
  let lastError: any = null;
  for (const instance of (INVIDIOUS_INSTANCES || []).slice(0, 15)) {
    try {
      const captionsUrl = `${instance}/api/v1/captions/${videoId}`;
      const content = await fetchViaProxy(captionsUrl, 'youtube', undefined, undefined, undefined, [
        PROXIES[1], // App Proxy
        PROXIES[2], // AllOrigins
        PROXIES[4], // corsproxy.io
      ]);
      const data = JSON.parse(content);
      const captionsArray = Array.isArray(data) ? data : data.captions || [];

      if (captionsArray.length > 0) {
        return captionsArray.map((c: any) => ({
          label: c.label || c.language_code || 'English',
          language_code: c.language_code || 'en',
          url: c.url.startsWith('http') ? c.url : `${instance}${c.url}`,
        }));
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (lastError) throw lastError;
  return [];
};
