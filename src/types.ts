export type FeedType = 'youtube' | 'rss';
export type ProxyAttemptCallback = (
  proxyName: string,
  status: 'success' | 'failure',
  feedType: FeedType
) => void;
export type ProxyStats = Record<
  string,
  {
    youtube: { success: number; failure: number };
    rss: { success: number; failure: number };
  }
>;

export const AVAILABLE_MODELS = ['gemini-2.5-flash'] as const;
export type AiModel = (typeof AVAILABLE_MODELS)[number];

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
  };
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
  tags?: string[];
  order?: number;
  isReddit?: boolean;
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
  channelUrl?: string;
}

export interface WebSource {
  uri: string;
  title: string;
  description?: string;
}

export interface DetailedDigestItem {
  title: string;
  link: string | null;
  summary: string | StructuredVideoSummary;
  sources?: WebSource[];
}
export type DetailedDigest = DetailedDigestItem[];

export interface ThematicDigestGroup {
  themeTitle: string;
  themeSummary: string;
  keywords: string[];
  articles: {
    id: string;
    feedId: string;
    title: string;
    link: string | null;
  }[];
}
export interface ThematicDigest {
  digestTitle: string;
  themedGroups: ThematicDigestGroup[];
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
export type GridZoomLevel = (typeof ZOOM_LEVELS)[number];
export type AutoplayMode = 'off' | 'on' | 'random' | 'repeat';
export type SidebarFeedsView = 'list' | 'icons';
export type ArticleViewMode = 'grid' | 'list' | 'reader';

export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string;
  sourceArticleIds: { feedId: string; articleId: string }[];
  createdAt: number;
  updatedAt: number;
}

export interface NoteFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface SyncData {
  feeds: Omit<Feed, 'id' | 'items' | 'error'>[];
  articlesByFeedUrl?: Record<string, Article[]>; // Key is feed.url
  readArticleIds?: [string, number][];
  readLaterArticleIds: string[];
  likedVideoIds?: string[];
  gridZoomLevel?: GridZoomLevel;
  articleZoomLevel?: GridZoomLevel;
  autoplayMode?: AutoplayMode;
  articleTags?: [string, string[]][];
  readLaterOrderYt?: string[];
  readLaterOrderRss?: string[];
  tagOrders?: Record<string, string[]>;
  favoritesOrderYt?: string[];
  favoritesOrderRss?: string[];
  notes?: Note[];
  noteFolders?: NoteFolder[];
}

export interface UserProfile {
  email: string;
}

export const TRANSLATION_LANGUAGES = [
  { code: 'original', name: 'Original Language' },
  { code: 'English', name: 'English' },
  { code: 'Simplified Chinese', name: '简体中文 (Simplified)' },
  { code: 'Traditional Chinese', name: '繁體中文 (Traditional)' },
  { code: 'Spanish', name: 'Español (Spanish)' },
  { code: 'French', name: 'Français (French)' },
  { code: 'German', name: 'Deutsch (German)' },
  { code: 'Italian', name: 'Italiano (Italian)' },
  { code: 'Portuguese', name: 'Português (Portuguese)' },
  { code: 'Russian', name: 'Русский (Russian)' },
  { code: 'Japanese', name: '日本語 (Japanese)' },
  { code: 'Korean', name: '한국어 (Korean)' },
  { code: 'Arabic', name: 'العربية (Arabic)' },
  { code: 'Hindi', name: 'हिन्दी (Hindi)' },
  { code: 'Indonesian', name: 'Bahasa Indonesia (Indonesian)' },
  { code: 'Vietnamese', name: 'Tiếng Việt (Vietnamese)' },
  { code: 'Turkish', name: 'Türkçe (Turkish)' },
  { code: 'Polish', name: 'Polski (Polish)' },
  { code: 'Dutch', name: 'Nederlands (Dutch)' },
  { code: 'Swedish', name: 'Svenska (Swedish)' },
  { code: 'Thai', name: 'ไทย (Thai)' },
  { code: 'Bengali', name: 'বাংলা (Bengali)' },
  { code: 'Hebrew', name: 'עברית (Hebrew)' },
  { code: 'Ukrainian', name: 'Українська (Ukrainian)' },
] as const;
