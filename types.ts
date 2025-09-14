export type FeedType = 'youtube' | 'rss';
export type ProxyAttemptCallback = (proxyName: string, status: 'success' | 'failure', feedType: FeedType) => void;
export type ProxyStats = Record<string, {
    youtube: { success: number; failure: number };
    rss: { success: number; failure: number };
}>;

export const AVAILABLE_MODELS = ['gemini-2.5-flash'] as const;
export type AiModel = typeof AVAILABLE_MODELS[number];

export interface YouTubeComment {
    author: string;
    authorThumbnails: { url: string }[];
    commentId: string;
    contentHtml: string;
    publishedText: string;
    likeCount: number;
    replies?: {
        comments: YouTubeComment[];
        continuation: string;
    }
}

export interface Article {
    feedId: string;
    id: string;
    title: string;
    link: string | null;
    description: string;
    pubDate: string | null;
    pubDateTimestamp: number | null;
    imageUrl: string | null;
    content: string;
    feedTitle: string;
    summary?: string;
    structuredSummary?: StructuredVideoSummary;
    sources?: WebSource[];
    isVideo?: boolean;
    views?: number | null;
    duration?: number | null;
    hasIframe?: boolean;
    comments?: YouTubeComment[];
}

export interface Feed {
    id: string;
    url: string;
    title: string;
    description?: string;
    items: Article[];
    isFavorite?: boolean;
    tags?: string[];
    error?: string | null;
    iconUrl?: string | null;
    maxArticles?: number;
    isPlaylist?: boolean;
}

export interface WebSource {
    uri: string;
    title: string;
    description?: string;
}

export interface HistoryDigest {
    synthesis: string;
    sources?: WebSource[];
}

export interface RecommendedFeed {
    title: string;
    url: string;
    reason: string;
}

export interface YouTubeSubscription {
    id: string;
    channelId: string;
    title: string;
    description: string;
    thumbnailUrl: string;
}

export interface TranscriptLine {
  text: string;
  start: number; // in seconds
  duration: number; // in seconds
}

export interface SummarySection {
    timestamp: number;
    title: string;
    summary: string;
}

export interface StructuredVideoSummary {
    overallSummary: string;
    sections: SummarySection[];
}

export interface CaptionChoice {
  label: string;
  language_code: string;
  url: string;
}

export const ZOOM_LEVELS = ['sm', 'md', 'lg', 'xl'] as const;
export type GridZoomLevel = typeof ZOOM_LEVELS[number];
export type AutoplayMode = 'off' | 'on' | 'random';

export interface SyncData {
    feeds: Omit<Feed, 'id' | 'items' | 'error'>[];
    articlesByFeedUrl?: Record<string, Article[]>; // Key is feed.url
    readArticleIds?: [string, number][];
    readLaterArticleIds: string[];
    likedVideoIds?: string[];
    gridZoomLevel?: GridZoomLevel;
    articleZoomLevel?: GridZoomLevel;
    autoplayMode?: AutoplayMode;
}

export interface UserProfile {
    name: string;
    email: string;
    picture: string;
}
