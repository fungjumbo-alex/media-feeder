import type { YouTubeSubscription, Feed, Article, YouTubeComment } from '../types';
import { INVIDIOUS_INSTANCES } from './proxyService';
import { fetchViaProxy } from './proxyService';

const YOUTUBE_API_BASE = 'https://youtube.googleapis.com/youtube/v3';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * Parses an ISO 8601 duration string (e.g., "PT2M3S") into seconds.
 * @param duration The ISO 8601 duration string.
 * @returns The total duration in seconds.
 */
const parseISO8601Duration = (duration: string): number | null => {
    const match = duration.match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);

    if (!match) {
        return null;
    }

    const years = match[1] ? parseInt(match[1]) : 0;
    const months = match[2] ? parseInt(match[2]) : 0;
    const weeks = match[3] ? parseInt(match[3]) : 0;
    const days = match[4] ? parseInt(match[4]) : 0;
    const hours = match[5] ? parseInt(match[5]) : 0;
    const minutes = match[6] ? parseInt(match[6]) : 0;
    const seconds = match[7] ? parseFloat(match[7]) : 0;

    // This isn't perfectly accurate for months/years but good enough for YouTube durations
    return (years * 31536000) + (months * 2592000) + (weeks * 604800) + (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
};

/**
 * A wrapper for fetch that adds authentication and the API key, plus centralized error handling.
 */
const fetchWithAuth = async (url: string, accessToken: string, options: RequestInit = {}) => {
    try {
        if (!YOUTUBE_API_KEY) {
            // The UI should prevent this call from happening, but this is a safeguard.
            throw new Error("YouTube API Key is not configured. Please set it to use this feature.");
        }

        const urlWithKey = new URL(url);
        urlWithKey.searchParams.append('key', YOUTUBE_API_KEY);

        const response = await fetch(urlWithKey.toString(), {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${accessToken}`,
            }
        });
        return response;
    } catch (error) {
        if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
            throw new Error('A network error occurred. Please check your internet connection and ensure ad-blockers are not interfering with Google APIs.');
        }
        throw error;
    }
};


/**
 * A centralized error handler for YouTube API calls.
 * Checks for authentication errors and throws a specific, identifiable error.
 */
const handleYouTubeError = async (response: Response, defaultMessage: string): Promise<never> => {
    if (response.status === 401 || response.status === 403) {
        const authError = new Error("Authentication failed. Your session may have expired or lacks permissions for YouTube. Please try signing in again.");
        (authError as any).isAuthError = true;
        throw authError;
    }
    
    let errorBody;
    try {
        errorBody = await response.json();
    } catch(e) {
        // If the body can't be parsed, we can't get more details.
        // This might happen for non-JSON error responses, like the caption download.
        const textError = await response.text().catch(() => '');
        if (textError) {
             throw new Error(`${defaultMessage}: ${textError} (Status: ${response.status})`);
        }
        throw new Error(`${defaultMessage} (Status: ${response.status})`);
    }

    console.error("YouTube API Error:", errorBody);
    const message = errorBody?.error?.message || defaultMessage;
    const reason = errorBody?.error?.errors?.[0]?.reason;
    throw new Error(reason ? `${message} (Reason: ${reason})` : message);
};

/**
 * Sends a "like" rating for a YouTube video using the user's OAuth 2.0 token.
 * @param videoId The ID of the YouTube video to like.
 * @param accessToken The user's OAuth 2.0 access token.
 * @throws An error if the API call fails.
 */
export const likeYouTubeVideo = async (videoId: string, accessToken: string): Promise<void> => {
    if (!videoId) throw new Error("Video ID is required.");
    if (!accessToken) throw new Error("A valid access token is required to like a video.");

    const response = await fetchWithAuth(`${YOUTUBE_API_BASE}/videos/rate?id=${videoId}&rating=like`, accessToken, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
    });

    if (response.status === 204) return;
    await handleYouTubeError(response, 'Failed to like YouTube video.');
};

/**
 * Fetches all of the user's YouTube subscriptions. It automatically handles pagination.
 * @param accessToken The user's OAuth 2.0 access token.
 * @returns An array of YouTubeSubscription objects.
 */
export const fetchYouTubeSubscriptions = async (accessToken: string): Promise<YouTubeSubscription[]> => {
    if (!accessToken) throw new Error("A valid access token is required to fetch YouTube subscriptions.");

    const allSubscriptions: YouTubeSubscription[] = [];
    let nextPageToken: string | undefined = undefined;

    do {
        const params = new URLSearchParams({ part: 'snippet', mine: 'true', maxResults: '50' });
        if (nextPageToken) params.set('pageToken', nextPageToken);

        const response = await fetchWithAuth(`${YOUTUBE_API_BASE}/subscriptions?${params.toString()}`, accessToken, {
             headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) await handleYouTubeError(response, 'Failed to fetch subscriptions from YouTube.');
        const data = await response.json();
        
        if (data.items) {
            for (const item of data.items) {
                if (item.snippet) {
                    allSubscriptions.push({
                        id: item.id,
                        channelId: item.snippet.resourceId.channelId,
                        title: item.snippet.title,
                        description: item.snippet.description,
                        thumbnailUrl: item.snippet.thumbnails.default.url,
                    });
                }
            }
        }
        nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    return allSubscriptions;
};

/**
 * Fetches all videos from a YouTube playlist using the YouTube Data API.
 * @param playlistId The ID of the YouTube playlist.
 * @param accessToken The user's OAuth 2.0 access token.
 * @returns A Feed object containing all videos from the playlist.
 */
export const fetchPlaylistAsFeed = async (playlistId: string, accessToken: string): Promise<Feed> => {
    const headers = { 'Accept': 'application/json' };

    const playlistDetailsUrl = `${YOUTUBE_API_BASE}/playlists?part=snippet&id=${playlistId}`;
    const playlistDetailsResponse = await fetchWithAuth(playlistDetailsUrl, accessToken, { headers });
    if (!playlistDetailsResponse.ok) await handleYouTubeError(playlistDetailsResponse, 'Failed to fetch YouTube playlist details.');

    const playlistDetailsData = await playlistDetailsResponse.json();
    const playlistSnippet = playlistDetailsData?.items?.[0]?.snippet;
    if (!playlistSnippet) throw new Error("Could not find details for the specified playlist.");

    const allItems: Article[] = [];
    let nextPageToken: string | undefined = undefined;
    const feedUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
    const channelUrl = `https://www.youtube.com/channel/${playlistSnippet.channelId}`;

    do {
        const params = new URLSearchParams({ part: 'snippet,contentDetails', playlistId: playlistId, maxResults: '50' });
        if (nextPageToken) params.set('pageToken', nextPageToken);
        
        const playlistItemsUrl = `${YOUTUBE_API_BASE}/playlistItems?${params.toString()}`;
        const playlistItemsResponse = await fetchWithAuth(playlistItemsUrl, accessToken, { headers });
        if (!playlistItemsResponse.ok) await handleYouTubeError(playlistItemsResponse, 'Failed to fetch videos from YouTube playlist.');
        
        const playlistItemsData = await playlistItemsResponse.json();
        if (playlistItemsData.items) {
            const videoSnippets = playlistItemsData.items
                .filter((item: any) => item.snippet?.resourceId?.kind === 'youtube#video' && item.snippet?.title !== 'Private video' && item.snippet?.title !== 'Deleted video')
                .map((item: any) => item.snippet);

            for (const snippet of videoSnippets) {
                const videoId = snippet.resourceId.videoId;
                const pubDate = snippet.publishedAt;
                let pubDateTimestamp: number | null = null;
                if (pubDate) {
                    try {
                        pubDateTimestamp = new Date(pubDate).getTime();
                    } catch (e) { /* ignore invalid dates */ }
                }
                
                allItems.push({
                    feedId: feedUrl,
                    id: videoId, title: snippet.title, link: `https://www.youtube.com/watch?v=${videoId}`, 
                    description: snippet.description, // This is a short snippet, good for the card view.
                    pubDate: pubDate,
                    pubDateTimestamp: pubDateTimestamp, imageUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
                    content: '', // Set content to empty to signal that full details need to be fetched on demand.
                    feedTitle: playlistSnippet.title, isVideo: true,
                });
            }
        }
        nextPageToken = playlistItemsData.nextPageToken;
    } while (nextPageToken);

    return {
        id: feedUrl, url: feedUrl, title: playlistSnippet.title, description: playlistSnippet.description,
        items: allItems.sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0)),
        iconUrl: playlistSnippet.thumbnails?.medium?.url || playlistSnippet.thumbnails?.default?.url, maxArticles: allItems.length, isPlaylist: true,
        channelUrl: channelUrl,
    };
};

/**
 * Fetches an Invidious watch page, and scrapes the embedded `ytInitialPlayerResponse` JSON object.
 * This is more reliable than using the Invidious JSON API, which is often disabled.
 * @param videoId The ID of the YouTube video.
 * @returns The parsed JSON data from the watch page.
 */
const fetchAndScrapeInvidiousWatchPage = async (videoId: string): Promise<any> => {
    let lastError: unknown = null;
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const fullUrl = `${instance}/watch?v=${videoId}`;
            const htmlContent = await fetchViaProxy(fullUrl, 'youtube');
            
            // This regex finds the `ytInitialPlayerResponse` object within a script tag.
            const match = htmlContent.match(/ytInitialPlayerResponse = ({.*?});/s);
            if (match && match[1]) {
                try {
                    const jsonData = JSON.parse(match[1]);
                    return jsonData;
                } catch (e) {
                    throw new Error(`Failed to parse JSON from ${instance}`);
                }
            }
            throw new Error(`Could not find ytInitialPlayerResponse JSON in page from ${instance}`);
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[DEBUG] Scraping watch page from instance ${instance} failed: ${message}. Trying next instance.`);
        }
    }
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`All Invidious instances failed to provide video details. Last error: ${errorMessage}`);
};

/**
 * Fetches full details for a single YouTube video using the scraping method.
 * @param videoId The ID of the YouTube video.
 * @returns The full description and view count.
 */
export const fetchYouTubeVideoDetails = async (videoId: string): Promise<{ description: string, views: number }> => {
    if (!videoId) throw new Error("Video ID is required.");

    const data = await fetchAndScrapeInvidiousWatchPage(videoId);

    const videoDetails = data?.videoDetails;
    const microformat = data?.microformat?.playerMicroformatRenderer;

    if (!videoDetails || !microformat) {
        throw new Error("Scraped data is missing critical details.");
    }
    
    const fullDescription = microformat.description?.simpleText || videoDetails.shortDescription;

    return {
        description: fullDescription || ' ',
        views: parseInt(videoDetails.viewCount, 10) || 0,
    };
};

/**
 * Fetches comments for a YouTube video using a public Invidious API instance and a proxy.
 * @param videoId The ID of the YouTube video.
 * @returns An array of YouTubeComment objects.
 */
export const fetchYouTubeComments = async (videoId: string): Promise<YouTubeComment[]> => {
    if (!videoId) throw new Error("Video ID is required to fetch comments.");

    let lastError: unknown = null;
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const commentsUrl = `${instance}/api/v1/comments/${videoId}`;
            const content = await fetchViaProxy(commentsUrl, 'youtube');
            const data = JSON.parse(content);
            
            if (data && Array.isArray(data.comments)) {
                return data.comments as YouTubeComment[];
            }
            throw new Error(`Invalid comment data structure from ${instance}`);
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[DEBUG] Comment fetch from instance ${instance} failed: ${message}. Trying next instance.`);
        }
    }
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`All Invidious instances failed to provide comments. Last error: ${errorMessage}`);
};

/**
 * Extracts the YouTube video ID from a URL.
 * @param url The YouTube URL.
 * @returns The video ID or null if not found.
 */
export const getYouTubeId = (url: string | null): string | null => {
    if (!url) return null;
    const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
    return (match && match[2].length === 11) ? match[2] : null;
};

/**
 * Fetches details for a single YouTube video by scraping and formats it as an Article.
 * If scraping fails, it falls back to the official YouTube Data API.
 * @param videoId The ID of the YouTube video.
 * @returns An Article object representing the video.
 */
export const fetchSingleYouTubeVideoAsArticle = async (videoId: string): Promise<Article> => {
    if (!videoId) throw new Error("Video ID is required.");

    // --- Method 1: Try scraping public data first ---
    try {
        const data = await fetchAndScrapeInvidiousWatchPage(videoId);

        const videoDetails = data?.videoDetails;
        const microformat = data?.microformat?.playerMicroformatRenderer;

        if (!videoDetails || !microformat || videoDetails.videoId !== videoId) {
            throw new Error("Scraped data is missing critical details or is for the wrong video.");
        }
        
        const pubDate = microformat.publishDate ? new Date(microformat.publishDate).toISOString() : new Date().toISOString();
        const pubDateTimestamp = microformat.publishDate ? new Date(microformat.publishDate).getTime() : Date.now();
        const feedId = `https://www.youtube.com/channel/${videoDetails.channelId}`;
        const fullDescription = microformat.description?.simpleText || videoDetails.shortDescription;

        const article: Article = {
            feedId: feedId,
            id: videoDetails.videoId,
            title: videoDetails.title,
            link: `https://www.youtube.com/watch?v=${videoDetails.videoId}`,
            description: fullDescription,
            content: fullDescription,
            pubDate: pubDate,
            pubDateTimestamp: pubDateTimestamp,
            imageUrl: videoDetails.thumbnail?.thumbnails?.pop()?.url || null,
            feedTitle: videoDetails.author,
            isVideo: true,
            views: parseInt(videoDetails.viewCount, 10) || null,
            duration: parseInt(videoDetails.lengthSeconds, 10) || null,
        };
        return article;
    } catch (scrapingError) {
        console.warn(`[DEBUG] Scraping for video ${videoId} failed. Falling back to YouTube Data API. Error:`, scrapingError);

        // --- Method 2: Fallback to YouTube Data API ---
        if (!YOUTUBE_API_KEY) {
            const scrapeErrorMessage = scrapingError instanceof Error ? scrapingError.message : String(scrapingError);
            throw new Error(`All public sources failed, and a YouTube API Key is not configured for fallback. Last error: ${scrapeErrorMessage}`);
        }

        try {
            const apiUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                const errorBody = await response.json().catch(() => null);
                const message = errorBody?.error?.message || `YouTube API responded with status ${response.status}`;
                throw new Error(message);
            }
            
            const data = await response.json();
            const videoData = data.items?.[0];

            if (!videoData) {
                throw new Error("Video not found via YouTube API. It may be private or deleted.");
            }

            const snippet = videoData.snippet;
            const contentDetails = videoData.contentDetails;
            const statistics = videoData.statistics;

            const article: Article = {
                feedId: `https://www.youtube.com/channel/${snippet.channelId}`,
                id: videoId,
                title: snippet.title,
                link: `https://www.youtube.com/watch?v=${videoId}`,
                description: snippet.description,
                content: snippet.description,
                pubDate: snippet.publishedAt,
                pubDateTimestamp: new Date(snippet.publishedAt).getTime(),
                imageUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || null,
                feedTitle: snippet.channelTitle,
                isVideo: true,
                views: statistics?.viewCount ? parseInt(statistics.viewCount, 10) : null,
                duration: contentDetails?.duration ? parseISO8601Duration(contentDetails.duration) : null,
            };
            return article;

        } catch (apiError) {
            console.error(`[DEBUG] YouTube Data API fallback also failed for video ${videoId}:`, apiError);
            const scrapeErrorMessage = scrapingError instanceof Error ? scrapingError.message : String(scrapingError);
            const apiErrorMessage = apiError instanceof Error ? apiError.message : String(apiError);
            throw new Error(`Both scraping and the official API failed to get video details.\nScraping error: ${scrapeErrorMessage}\nAPI error: ${apiErrorMessage}`);
        }
    }
};