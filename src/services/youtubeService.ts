import type { YouTubeSubscription, Feed, Article, YouTubeComment } from '../types';
import { INVIDIOUS_INSTANCES, fetchViaProxy } from './proxyService';

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
    // This might happen for non-JSON error responses, like the caption download.
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
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
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
): Promise<Map<string, number>> => {
  const durationMap = new Map<string, number>();

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
              durationMap.set(item.id, durationSeconds);
            }
          }
        }
      }
    } catch (error) {}
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

  // 3. Fetch video durations for all items
  const videoIds = allItems.map(item => item.id);
  const durations = await fetchVideosDuration(videoIds, accessToken);

  // Update items with duration
  const itemsWithDuration = allItems.map(item => ({
    ...item,
    duration: durations.get(item.id) || null,
  }));

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
          imageUrl:
            data.videoThumbnails?.find(t => t.quality === 'maxres')?.url ||
            data.videoThumbnails?.[0]?.url,
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
