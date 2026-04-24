/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useContext,
  ReactNode,
  FC,
} from 'react';
import { fetchAndParseRss } from '../services/rssService';
import { findArticleIdsForTopic } from '../utils/mindmapUtils';
import { buildSearchIndex, searchArticles } from '../utils/searchService';
import {
  generateRecommendations,
  generateRelatedChannels,
  fetchAvailableCaptionChoices,
  fetchAndParseTranscript,
  summarizeYouTubeVideo,
  summarizeText,
  generateThematicDigest,
  translateThematicDigest,
  translateDetailedDigest,
  QuotaExceededError,
  generateMindmapHierarchy,
} from '../services/geminiService';
import {
  fetchYouTubeComments,
  getYouTubeId,
  fetchYouTubeVideoDetails,
  likeYouTubeVideo,
  fetchYouTubeSubscriptions,
  fetchPlaylistAsFeed,
  fetchSingleYouTubeVideoAsArticle,
  fetchVideosDuration,
} from '../services/youtubeService';
import { fetchContentFromPastebinUrl } from '../services/pastebinService';
import {
  verifyDrivePermissions,
  getDriveFileMetadata,
  saveDataToDrive,
  loadDataFromDrive,
} from '../services/googleDriveService';
import type {
  Feed,
  Article,
  DetailedDigest,
  DetailedDigestItem,
  RecommendedFeed,
  SyncData,
  GridZoomLevel,
  WebSource,
  ProxyStats,
  FeedType,
  AiModel,
  AutoplayMode,
  StructuredVideoSummary,
  YouTubeComment,
  UserProfile,
  YouTubeSubscription,
  SidebarFeedsView,
  ThematicDigest,
  Note,
  NoteFolder,
  ArticleViewMode,
  MindmapHierarchy,
  Highlight,
} from '../types';
import { ZOOM_LEVELS, AVAILABLE_MODELS } from '../types';
import * as LZString from 'lz-string';
import { createEpub } from '../utils/epubUtils';
import { formatTranscriptTime } from '../utils/dateUtils';
import {
  fetchViaProxy,
  PROXIES,
  testAllSources,
  type SourceTestResult,
} from '../services/proxyService';

const FEEDS_STORAGE_KEY = 'media-feeder-feeds-v3';
const ARTICLE_TAGS_KEY = 'media-feeder-article-tags-v1';
const READ_ARTICLES_KEY = 'media-feeder-read-articles-v2';
const READ_LATER_KEY = 'media-feeder-read-later-v2';
const LIKED_YOUTUBE_VIDEOS_KEY = 'media-feeder-liked-videos';
const SIDEBAR_COLLAPSED_KEY = 'media-feeder-sidebar-collapsed';
const SIDEBAR_TAB_KEY = 'media-feeder-sidebar-tab-v1';
const SIDEBAR_FEEDS_VIEW_KEY = 'media-feeder-sidebar-feeds-view';
const VIEWS_COLLAPSED_KEY = 'media-feeder-views-collapsed';
const TAGS_COLLAPSED_KEY = 'media-feeder-tags-collapsed';
const YOUTUBE_TAGS_COLLAPSED_KEY = 'media-feeder-youtube-tags-collapsed';
const RSS_TAGS_COLLAPSED_KEY = 'media-feeder-rss-tags-collapsed';
const EXPANDED_TAGS_KEY = 'media-feeder-expanded-tags';
const EXPANDED_VIEWS_KEY = 'media-feeder-expanded-views';
const YOUTUBE_FEEDS_COLLAPSED_KEY = 'media-feeder-youtube-feeds-collapsed';
const YOUTUBE_PLAYLISTS_COLLAPSED_KEY = 'media-feeder-youtube-playlists-collapsed';
const REDDIT_FEEDS_COLLAPSED_KEY = 'media-feeder-reddit-feeds-collapsed';
const RSS_FEEDS_COLLAPSED_KEY = 'media-feeder-rss-feeds-collapsed';
const GRID_ZOOM_LEVEL_KEY = 'media-feeder-grid-zoom-level';
const ARTICLE_ZOOM_LEVEL_KEY = 'media-feeder-article-zoom-level';
const ARTICLE_VIEW_MODE_KEY = 'media-feeder-article-view-mode-v2';
const ARTICLES_CACHE_KEY = 'media-feeder-articles-cache';
const ARTICLES_CACHE_LIMIT = 10; // Cache the 10 most recent unread articles per feed.
const PROXY_STATS_KEY = 'media-feeder-proxy-stats-v2';
const DISABLED_PROXIES_KEY = 'media-feeder-disabled-proxies-v2';
const AUTOPLAY_MODE_KEY = 'media-feeder-autoplay-mode-v2';
const AUTO_LIKE_YOUTUBE_VIDEOS_KEY = 'media-feeder-auto-like-yt';
const AUTO_LIKE_DELAY_SECONDS_KEY = 'media-feeder-auto-like-delay';
const REFRESH_BATCH_SIZE_KEY = 'media-feeder-refresh-batch-size';
const REFRESH_DELAY_SECONDS_KEY = 'media-feeder-refresh-delay-seconds';
const ENABLE_RSS_REDDIT_KEY = 'media-feeder-enable-rss-reddit';
const DEFAULT_AI_LANGUAGE_KEY = 'media-feeder-default-ai-language';
const RECENT_SHARE_CODES_KEY = 'media-feeder-recent-share-codes';
const HAS_ENTERED_KEY = 'media-feeder-has-entered';
const READ_LATER_ORDER_YT_KEY = 'media-feeder-read-later-order-yt-v1';
const READ_LATER_ORDER_RSS_KEY = 'media-feeder-read-later-order-rss-v1';
const TAG_ORDERS_KEY = 'media-feeder-tag-orders-v1';
const FAVORITES_ORDER_YT_KEY = 'media-feeder-favorites-order-yt-v1';
const FAVORITES_ORDER_RSS_KEY = 'media-feeder-favorites-order-rss-v1';
const AUTO_UPLOAD_AFTER_REFRESH_KEY = 'media-feeder-auto-upload-after-refresh';
const AUTO_SUMMARIZE_ON_REFRESH_KEY = 'media-feeder-auto-summarize-on-refresh';
const AUTO_CLUSTER_ON_REFRESH_KEY = 'media-feeder-auto-cluster-on-refresh';
const AUTO_TRANSCRIBE_ON_REFRESH_KEY = 'media-feeder-auto-transcribe-on-refresh';
const AUTO_AI_TIME_WINDOW_DAYS_KEY = 'media-feeder-auto-ai-time-window-days';
const NOTES_KEY = 'media-feeder-notes-v1';
const NOTE_FOLDERS_KEY = 'media-feeder-note-folders-v1';
const NOTES_COLLAPSED_KEY = 'media-feeder-notes-collapsed-v1';
const HIGHLIGHTS_KEY = 'media-feeder-highlights-v1';
const TRENDING_KEYWORDS_KEY = 'media-feeder-trending-keywords-v2';
const AI_DISABLED_KEY = 'media-feeder-ai-disabled-v1';

type YouTubeImportState = {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  subscriptions: YouTubeSubscription[];
  error: string | null;
};
type CurrentView = { type: string; value?: any };
type CommentState = { comments: YouTubeComment[] | null; isLoading: boolean; error: string | null };
type DigestState = {
  digest: DetailedDigest | ThematicDigest | null;
  type: 'detailed' | 'thematic' | null;
  error: string | null;
  isLoading: boolean;
  loadingMessage: string | null;
};
type DriveSyncStatus = {
  status: 'checking' | 'ready' | 'no_permission' | 'error';
  error?: string | null;
  fileMetadata?: { id: string; modifiedTime: string } | null;
};
interface RefreshOptions {
  yt: boolean;
  nonYt: boolean;
  favoritesOnly: boolean;
  ytMax: number;
  nonYtMax: number;
}
interface BulkEditModalConfig {
  isOpen: boolean;
  mode: 'add' | 'set' | 'favorite';
  tag?: string;
}

// --- Share Code Compression Helpers ---
function hexToBase64(hex: string): string {
  let str = '';
  // Ensure hex string has an even length
  if (hex.length % 2 !== 0) hex = '0' + hex;
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  // URL-safe Base64: replace '+' with '-', '/' with '_', and remove '=' padding.
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64ToHex(base64: string): string {
  // Restore URL-safe characters and padding
  base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const str = atob(base64);
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Pad with a leading zero if necessary
    hex += (code < 16 ? '0' : '') + code.toString(16);
  }
  return hex;
}
// --- End Helpers ---

const getStoredData = <T,>(
  key: string,
  defaultValue: T,
  reviver?: (key: string, value: any) => any
): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored, reviver) : defaultValue;
  } catch (e) {
    console.error(`Failed to parse stored data for key "${key}":`, e);
    return defaultValue;
  }
};
const getPrunedReadArticleIds = (): Map<string, number> => {
  const storedIds = getStoredData<Map<string, number>>(READ_ARTICLES_KEY, new Map(), (k, v) =>
    k === '' ? new Map(Array.isArray(v) ? v : undefined) : v
  );
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const newReadIds = new Map<string, number>();
  for (const [id, timestamp] of storedIds.entries()) {
    if ((timestamp as number) >= twentyFourHoursAgo) newReadIds.set(id, timestamp);
  }
  return newReadIds;
};

const deduplicateArticles = (articles: Article[]): Article[] => {
  const uniqueArticles = new Map<string, Article>();
  for (const article of articles) {
    if (!uniqueArticles.has(article.id)) {
      uniqueArticles.set(article.id, article);
    }
  }
  return Array.from(uniqueArticles.values());
};

const getInitialView = (): CurrentView => {
  let hash = window.location.hash;
  if (hash.startsWith('#/')) {
    hash = hash.substring(2);
  } else if (hash.startsWith('#')) {
    hash = hash.substring(1);
  }

  if (!hash) return { type: 'all-subscriptions' };

  if (hash.startsWith('url=')) {
    const url = hash.substring(4);
    if (url) return { type: 'add-feed-from-url', value: decodeURIComponent(url) };
  }

  if (hash.startsWith('import=')) {
    const code = hash.substring(7);
    if (code) return { type: 'import', value: decodeURIComponent(code) };
  }

  if (hash.startsWith('article/')) {
    const parts = hash.substring(8).split('/');
    if (parts.length >= 2) {
      return {
        type: 'article',
        value: {
          feedId: decodeURIComponent(parts[0]),
          articleId: decodeURIComponent(parts[1]),
        },
      };
    }
  }

  const [type, ...valueParts] = hash.split('/');
  const value = valueParts.join('/');

  if (type === 'feed') return { type: 'feed', value: decodeURIComponent(value) };
  if (type === 'note-folder') return { type: 'note-folder', value: decodeURIComponent(value) };
  if (type === 'search') return { type: 'search', value: decodeURIComponent(value) };
  if (type === 'import') return { type: 'import', value: decodeURIComponent(value) };
  if (type === 'keyword-articles')
    return { type: 'keyword-articles', value: decodeURIComponent(value) };
  if (type === 'ai-topic') return { type: 'ai-topic', value: { title: decodeURIComponent(value) } };

  const tabbedViews = ['published-today', 'readLater', 'history', 'favorites'];
  if (tabbedViews.includes(type)) {
    return { type, value: valueParts[0] || 'yt' };
  }

  if (type === 'tag') {
    if (valueParts.length === 2 && (valueParts[0] === 'youtube' || valueParts[0] === 'rss')) {
      return {
        type: 'tag',
        value: { name: decodeURIComponent(valueParts[1]), type: valueParts[0] },
      };
    }
    if (valueParts.length > 0) {
      return { type: 'tag', value: decodeURIComponent(value) };
    }
  }

  const validTypes = [
    'all-subscriptions',
    'inactive-feeds',
    'dump',
    'privacy-policy',
    'about',
    'help',
    'ai-summary-yt',
    'yt-transcripts',
  ];
  if (validTypes.includes(type)) return { type };

  return { type: 'all-subscriptions' };
};

const filterArticlesForTag = (
  articles: Article[],
  tagValue: any,
  feedsById: Map<string, Feed>
): Article[] => {
  if (typeof tagValue === 'object' && tagValue.name && tagValue.type) {
    const { name, type } = tagValue;

    const filtered = articles.filter(article => {
      const hasTag = article.tags?.includes(name) ?? false;
      if (!hasTag) return false;

      const feed = feedsById.get(article.feedId);
      if (!feed) {
        return false;
      }

      const isYouTube = feed.url.toLowerCase().includes('youtube.com');
      const typeMatch = type === 'youtube' ? isYouTube : !isYouTube;

      return typeMatch;
    });
    return filtered;
  } else if (typeof tagValue === 'string') {
    return articles.filter(article => article.tags?.includes(tagValue));
  }
  return [];
};

const generateArticleMarkdown = async (article: Article): Promise<string> => {
  let articleMarkdown = article.link
    ? `## [${article.title}](${article.link})\n\n`
    : `## ${article.title}\n\n`;
  if (article.imageUrl) {
    articleMarkdown += `![Image for ${article.title}](${article.imageUrl})\n\n`;
  }

  // Prioritize AI summary if it exists
  if (article.structuredSummary) {
    articleMarkdown += `### AI Summary\n\n${article.structuredSummary.overallSummary}\n\n`;
    if (article.structuredSummary.sections.length > 0) {
      articleMarkdown += `#### Key Moments\n`;
      article.structuredSummary.sections.forEach(section => {
        const timestamp = `[${formatTranscriptTime(section.timestamp)}](${article.link}&t=${Math.floor(section.timestamp)}s)`;
        articleMarkdown += `- **${timestamp} - ${section.title}**: ${section.summary}\n`;
      });
      articleMarkdown += `\n`;
    }
  } else if (article.summary) {
    articleMarkdown += `### AI Summary\n\n${article.summary}\n\n`;
  } else {
    // Fallback to description snippet if no AI summary
    const rawContent = article.content || article.description || '';
    const textContent = rawContent
      .replace(/<[^>]*>?/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (textContent) {
      articleMarkdown += `${textContent.substring(0, 500)}...\n\n`;
    }
  }

  // If it's a YouTube video, try to use existing transcript or fetch and append it.
  if (article.isVideo && article.link) {
    if (article.transcript && article.transcript.length > 0) {
      articleMarkdown += `### Transcript\n\n`;
      article.transcript.forEach(line => {
        const timestamp = `[${formatTranscriptTime(line.start)}](${article.link}&t=${Math.floor(line.start)}s)`;
        articleMarkdown += `${timestamp} ${line.text}\n`;
      });
      articleMarkdown += `\n`;
    } else {
      const videoId = getYouTubeId(article.link);
      if (videoId) {
        try {
          const choices = await fetchAvailableCaptionChoices(videoId);
          if (choices.length > 0) {
            const transcriptLines = await fetchAndParseTranscript(choices[0].url);
            if (transcriptLines.length > 0) {
              articleMarkdown += `### Transcript\n\n`;
              transcriptLines.forEach(line => {
                const timestamp = `[${formatTranscriptTime(line.start)}](${article.link}&t=${Math.floor(line.start)}s)`;
                articleMarkdown += `${timestamp} ${line.text}\n`;
              });
              articleMarkdown += `\n`;
            }
          }
        } catch (e) {
          console.warn(`Could not fetch transcript for article "${article.title}" for note:`, e);
          articleMarkdown += `\n_Transcript could not be loaded._\n`;
        }
      }
    }
  }

  return articleMarkdown;
};

interface AppContextType {
  feeds: Feed[];
  isInitialLoad: boolean;
  isViewLoading: boolean;
  selectedFeedId: string | null;
  selectedArticle: Article | null;
  setSelectedArticle: React.Dispatch<React.SetStateAction<Article | null>>;
  currentView: CurrentView;
  contentView:
    | 'articles'
    | 'feedsGrid'
    | 'inactiveFeeds'
    | 'feedHealth'
    | 'dump'
    | 'privacyPolicy'
    | 'about'
    | 'help'
    | 'notes';
  readArticleIds: Map<string, number>;
  readLaterArticleIds: Set<string>;
  likedVideoIds: Set<string>;
  isSidebarCollapsed: boolean;
  sidebarTab: 'yt' | 'rss';
  handleSetSidebarTab: (tab: 'yt' | 'rss') => void;
  isViewsCollapsed: boolean;
  isYoutubeFeedsCollapsed: boolean;
  isRssFeedsCollapsed: boolean;
  isRedditFeedsCollapsed: boolean;
  isTagsCollapsed: boolean;
  isNotesCollapsed: boolean;
  onToggleNotesCollapse: () => void;
  sidebarFeedsView: SidebarFeedsView;
  handleSetSidebarFeedsView: (view: SidebarFeedsView) => void;
  isYoutubePlaylistsCollapsed: boolean;
  expandedTags: Set<string>;
  expandedViews: Set<string>;
  onToggleViewExpansion: (viewType: 'published-today' | 'readLater' | 'history') => void;
  isAddFeedModalOpen: boolean;
  setAddFeedModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isExportModalOpen: boolean;
  setIsExportModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isAdvancedInfoModalOpen: boolean;
  setIsAdvancedInfoModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isAiSettingsModalOpen: boolean;
  setIsAiSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isImportTextModalOpen: boolean;
  setIsImportTextModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isProxyStatsModalOpen: boolean;
  setIsProxyStatsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isCacheInfoModalOpen: boolean;
  setIsCacheInfoModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isExportTextModalOpen: boolean;
  setIsExportTextModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isClearDataModalOpen: boolean;
  setIsClearDataModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSyncDataModalOpen: boolean;
  setIsSyncDataModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isActionsMenuOpen: boolean;
  setIsActionsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  exportTextContent: string;
  proxyStats: ProxyStats;
  disabledProxies: Set<string>;
  handleResetNetworkSettings: () => void;
  handleProxyAttempt: (
    proxyName: string,
    status: 'success' | 'failure',
    feedType: FeedType
  ) => void;
  handleClearProxyStats: () => void;
  handleToggleProxy: (proxyName: string, feedType: FeedType) => void;
  feedToEdit: Feed | null;
  setFeedToEdit: React.Dispatch<React.SetStateAction<Feed | null>>;
  feedToEditTags: Feed | null;
  setFeedToEditTags: React.Dispatch<React.SetStateAction<Feed | null>>;
  isDigestModalOpen: boolean;
  setIsDigestModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  digestState: DigestState;
  isDigestConfigModalOpen: boolean;
  setIsDigestConfigModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  articlesForDigest: Article[];
  initialDigestLanguage: string;
  translateDigest: (
    digest: DetailedDigest | ThematicDigest,
    type: 'detailed' | 'thematic',
    targetLanguage: string
  ) => Promise<DetailedDigest | ThematicDigest>;
  isRecommendationsModalOpen: boolean;
  setIsRecommendationsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  recommendationsState: {
    recommendations: RecommendedFeed[] | null;
    error: string | null;
    isLoading: boolean;
  };
  setRecommendationsState: React.Dispatch<
    React.SetStateAction<{
      recommendations: RecommendedFeed[] | null;
      error: string | null;
      isLoading: boolean;
    }>
  >;
  isRelatedModalOpen: boolean;
  setIsRelatedModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  relatedChannelsState: {
    recommendations: RecommendedFeed[] | null;
    error: string | null;
    isLoading: boolean;
  };
  setRelatedChannelsState: React.Dispatch<
    React.SetStateAction<{
      recommendations: RecommendedFeed[] | null;
      error: string | null;
      isLoading: boolean;
    }>
  >;
  relatedSourceFeedId: string | null;
  setRelatedSourceFeedId: React.Dispatch<React.SetStateAction<string | null>>;
  bulkEditModalConfig: BulkEditModalConfig;
  setBulkEditModalConfig: React.Dispatch<React.SetStateAction<BulkEditModalConfig>>;
  toast: { message: string; type: 'success' | 'error' } | null;
  setToast: React.Dispatch<
    React.SetStateAction<{ message: string; type: 'success' | 'error' } | null>
  >;
  isRefreshingAll: boolean;
  refreshingFeedId: string | null;
  refreshProgress: number | null;
  allArticles: Article[];
  inactiveFeeds: (Feed & { lastPostTimestamp: number })[];
  inactivePeriod: 1 | 3 | 6 | 12 | 'all';
  setInactivePeriod: React.Dispatch<React.SetStateAction<1 | 3 | 6 | 12 | 'all'>>;
  allTags: string[];
  youtubeTags: string[];
  rssTags: string[];
  sortedFeeds: Feed[];
  favoriteFeeds: Feed[];
  unreadCounts: Record<string, number>;
  commentsState: CommentState;
  handleFetchComments: (videoId: string) => Promise<void>;
  handleFetchArticleDetails: (articleId: string) => Promise<void>;
  youtubeUnreadTagCounts: Record<string, number>;
  rssUnreadTagCounts: Record<string, number>;
  unreadPublishedTodayYtCount: number;
  unreadPublishedTodayRssCount: number;
  unreadPublishedTodayCount: number;
  unreadReadLaterYtCount: number;
  unreadReadLaterRssCount: number;
  unreadReadLaterCount: number;
  historyYtCount: number;
  historyRssCount: number;
  historyCount: number;
  unreadFavoritesYtCount: number;
  unreadFavoritesRssCount: number;
  unreadFavoritesCount: number;
  unreadAiSummaryYtCount: number;
  unreadTranscriptYtCount: number;
  feedsForPublishedToday: Feed[];
  feedsForReadLater: Feed[];
  feedsForHistory: Feed[];
  unreadCountsForPublishedToday: Record<string, number>;
  unreadCountsForReadLater: Record<string, number>;
  feedsByTag: Map<string, Feed[]>;
  feedsById: Map<string, Feed>;
  articlesById: Map<string, Article>;
  articlesToShow: Article[];
  articlesForNavigation: Article[];
  availableTagsForFilter: string[];
  unreadVisibleCount: number;
  headerTitle: string;
  emptyMessage: string;
  articleNavigation: {
    hasNextArticle: boolean;
    hasPreviousArticle: boolean;
    onNextArticle: () => void;
    onPreviousArticle: () => void;
  };
  gridZoomLevel: GridZoomLevel;
  canZoomIn: boolean;
  canZoomOut: boolean;
  articleZoomLevel: GridZoomLevel;
  canArticleZoomIn: boolean;
  canArticleZoomOut: boolean;
  articleViewMode: ArticleViewMode;
  setArticleViewMode: React.Dispatch<React.SetStateAction<ArticleViewMode>>;
  aiModel: AiModel;
  defaultAiLanguage: string;
  setDefaultAiLanguage: React.Dispatch<React.SetStateAction<string>>;
  personalInterests: string[];
  setPersonalInterests: React.Dispatch<React.SetStateAction<string[]>>;
  handleAddPersonalInterest: (topic: string) => void;
  handleRemovePersonalInterest: (topic: string) => void;
  autoplayMode: AutoplayMode;
  autoLikeYouTubeVideos: boolean;
  autoLikeDelaySeconds: number;
  setAutoLikeDelaySeconds: React.Dispatch<React.SetStateAction<number>>;
  accessToken: string | null;
  enableRssAndReddit: boolean;
  refreshBatchSize: number;
  setRefreshBatchSize: React.Dispatch<React.SetStateAction<number>>;
  refreshDelaySeconds: number;
  setRefreshDelaySeconds: React.Dispatch<React.SetStateAction<number>>;
  activeTagFilter: string | null;
  recentShareCodes: string[];
  importCodeFromUrl: string | null;
  setImportCodeFromUrl: React.Dispatch<React.SetStateAction<string | null>>;
  isResolvingArticleUrl: boolean;
  handleSetTagFilter: (tag: string | null) => void;
  handleToggleAutoplayNext: () => void;
  handleToggleAutoplayRandom: () => void;
  handleToggleAutoplayRepeat: () => void;
  handleToggleAutoLikeYouTubeVideos: () => void;
  autoUploadAfterRefresh: boolean;
  handleToggleAutoUploadAfterRefresh: () => void;
  autoSummarizeOnRefresh: boolean;
  handleToggleAutoSummarizeOnRefresh: () => void;
  autoClusterOnRefresh: boolean;
  handleToggleAutoClusterOnRefresh: () => void;
  autoTranscribeOnRefresh: boolean;
  handleToggleAutoTranscribeOnRefresh: () => void;
  autoAiTimeWindowDays: number;
  setAutoAiTimeWindowDays: React.Dispatch<React.SetStateAction<number>>;
  handleToggleRssAndReddit: () => void;
  urlFromExtension: string | null;
  setUrlFromExtension: React.Dispatch<React.SetStateAction<string | null>>;
  isProcessingUrl: boolean;
  isDemoMode: boolean;
  demoStep: number;
  startDemo: () => void;
  endDemo: () => void;
  handleDemoNext: () => void;
  handleViewChange: (type: string, value?: any) => void;
  handleSelectFeed: (feedId: string) => void;
  handleAddFeed: (
    rawUrl: string,
    options?: { headless?: boolean; silent?: boolean }
  ) => Promise<Feed | void>;
  handleAddFromRecommendation: (
    url: string,
    title: string,
    inheritedTags?: string[]
  ) => Promise<void>;
  handleDeleteFeed: (feedId: string) => void;
  handleDeleteTag: (tagToDelete: string) => void;
  handleRenameTag: (oldName: string, newName: string) => void;
  handleBulkDeleteFeeds: (feedIds: Set<string>) => void;
  handleToggleFavorite: (feedId: string) => void;
  handleSaveFeedTitle: (feedId: string, title: string) => void;
  handleSaveFeedTags: (feedId: string, tags: string[]) => void;
  handleSaveFeedMaxArticles: (feedId: string, max: number) => void;
  handleToggleReadStatus: (articleId: string) => void;
  handleToggleReadLater: (articleId: string) => void;
  handleSummaryGenerated: (
    articleId: string,
    summary: string | StructuredVideoSummary,
    sources?: WebSource[]
  ) => void;
  handleRefreshSingleFeed: (feedId: string) => Promise<void>;
  handleRefreshAllTranscripts: () => Promise<void>;
  handleRefreshCurrentView: () => Promise<void>;
  handleRefreshMissingIcons: () => Promise<void>;
  handleGenerateDigest: () => void;
  handleExecuteDetailedDigest: (
    selectedArticles: Article[],
    targetLanguage: string
  ) => Promise<void>;
  handleExecuteThematicDigest: (
    selectedArticles: Article[],
    targetLanguage: string
  ) => Promise<void>;
  handleGenerateRecommendations: (customQuery?: string) => Promise<void>;
  handleGenerateMoreRecommendations: (customQuery?: string) => Promise<void>;
  handleResetRecommendations: () => void;
  handleExportFeeds: (options: { favoritesOnly?: boolean; tag?: string }) => void;
  handleExportChannelsAsText: () => void;
  handleShareToCloudLink: (options?: {
    tag?: string;
  }) => Promise<{ fullUrl: string; shortCode: string }>;
  handleImportData: (data: SyncData, options?: { silent?: boolean }) => void;
  handleOpenClearDataModal: () => void;
  handleClearArticles: (options: {
    clearYT: boolean;
    clearNonYT: boolean;
    keepReadLater: boolean;
  }) => void;
  handleFactoryReset: () => void;
  handleSearch: (query: string) => void;
  handleClearSearch: () => void;
  handleClearHistory: () => void;
  handleClearReadLater: () => void;
  handleMarkAllInAllFeedsAsRead: () => void;
  handleMarkAllRead: () => void;
  handleMarkSelectedAsRead: () => void;
  handleOpenArticle: (article: Article) => void;
  handleCloseArticleModal: () => void;
  handleRemoveArticle: (articleId: string, feedId: string) => void;
  handleBulkDeleteArticles: () => void;
  handleReorderArticles: (
    view: { type: string; value?: any },
    sourceId: string,
    targetId: string | null
  ) => void;
  handleOpenRelatedModal: (feedId: string) => void;
  handleCloseRelatedModal: () => void;
  handleGenerateRelated: () => Promise<void>;
  handleBulkUpdateTags: (
    feedIds: Set<string>,
    tags: string[],
    mode: 'add' | 'set' | 'favorite'
  ) => void;
  handleOpenBulkEdit: () => void;
  handleOpenBulkEditForTag: (tag: string) => void;
  handleOpenBulkEditForFavorites: () => void;
  onToggleSidebar: () => void;
  onToggleViewsCollapse: () => void;
  onToggleYoutubeFeedsCollapse: () => void;
  onToggleRssFeedsCollapse: () => void;
  onToggleRedditFeedsCollapse: () => void;
  onToggleTagsCollapse: () => void;
  onToggleTagExpansion: (tag: string, tagType: 'youtube' | 'rss') => void;
  onToggleYoutubePlaylistsCollapse: () => void;
  isYoutubeTagsCollapsed: boolean;
  onToggleYoutubeTagsCollapse: () => void;
  isRssTagsCollapsed: boolean;
  onToggleRssTagsCollapse: () => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleArticleZoomIn: () => void;
  handleArticleZoomOut: () => void;
  calculateStorageSize: () => string;
  handleClearArticlesCache: () => void;
  handleClearAllTags: () => void;
  userProfile: UserProfile | null;
  handleGoogleSignIn: (options?: { showConsentPrompt?: boolean; isSilent?: boolean }) => void;
  handleGoogleSignOut: () => void;
  handleImportBundledChannels: (feedsToImport: Omit<Feed, 'id' | 'items' | 'error'>[]) => void;
  isBundledChannelsModalOpen: boolean;
  setIsBundledChannelsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isImportYouTubeModalOpen: boolean;
  setIsImportYouTubeModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  youTubeImportState: YouTubeImportState;
  handleFetchYouTubeSubscriptions: () => Promise<void>;
  handleClearYouTubeImportState: () => void;
  handleAddYouTubeChannels: (subscriptions: YouTubeSubscription[]) => Promise<void>;
  handleLikeVideo: (article: Article, options?: { isAutoLike?: boolean }) => Promise<void>;
  articleToEditTags: Article | null;
  setArticleToEditTags: React.Dispatch<React.SetStateAction<Article | null>>;
  isBulkEditArticleTagsModalOpen: boolean;
  setIsBulkEditArticleTagsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedArticleIdsForBatch: Set<string>;
  handleToggleArticleSelection: (articleId: string) => void;
  handleSelectAllArticles: () => void;
  handleClearArticleSelection: () => void;
  handleSaveArticleTags: (articleId: string, tags: string[]) => void;
  handleBulkSaveArticleTags: (articleIds: Set<string>, tags: string[], mode: 'add' | 'set') => void;
  handleBulkClearArticleTags: () => void;
  videoToAdd: Article | null;
  handleConfirmAddChannel: (channelUrl: string, channelTitle: string) => Promise<void>;
  handleConfirmAddSingleVideo: (videoArticle: Article) => Promise<void>;
  handleCancelAddVideoOrChannel: () => void;
  hasEnteredApp: boolean;
  handleEnterApp: () => void;
  youtubeFeeds: Feed[];
  rssAndOtherFeeds: Feed[];
  feedsForGrid: Feed[];
  isMobileView: boolean;
  driveSyncStatus: DriveSyncStatus;
  handleUploadToDrive: (options?: { silent?: boolean }) => Promise<void>;
  handleDownloadFromDrive: () => Promise<void>;
  isTrendingKeywordsModalOpen: boolean;
  setIsTrendingKeywordsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  trendingKeywords: Array<{ keyword: string; count: number }>;
  isGeneratingKeywords: boolean;
  keywordGenerationError: string | null;
  handleGenerateTrendingKeywords: (forceRefresh?: boolean) => Promise<void>;
  isGeneratingEbook: boolean;
  handleGenerateEbook: () => Promise<void>;
  isGeneratingEbookFromView: boolean;
  handleGenerateEbookFromView: () => Promise<void>;
  isGeneratingSummaries: boolean;
  handleGenerateSummariesForSelected: () => Promise<void>;
  handleGenerateSummariesForView: () => Promise<void>;
  summaryGenerationProgress: number | null;
  notes: Note[];
  noteFolders: NoteFolder[];
  isNoteEditorModalOpen: boolean;
  noteToEdit: Note | null;
  initialNoteContent: {
    title: string;
    content: string;
    sourceArticleIds: { feedId: string; articleId: string }[];
  } | null;
  handleOpenNoteEditor: (
    note?: Note,
    initialContent?: {
      title: string;
      content: string;
      sourceArticleIds: { feedId: string; articleId: string }[];
    }
  ) => void;
  handleCloseNoteEditor: () => void;
  handleSaveNote: (
    note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>,
    id?: string
  ) => Promise<Note>;
  handleDeleteNote: (noteId: string) => void;
  handleAddNoteFolder: (name: string) => Promise<NoteFolder>;
  handleDeleteNoteFolder: (folderId: string) => void;
  handleSaveSummaryAsNote: (article: Article) => void;
  handleSaveDigestAsNote: (digest: DetailedDigest | ThematicDigest, articles: Article[]) => void;
  notesForView: Note[];
  isSavingViewAsNote: boolean;
  handleSaveViewAsNote: () => Promise<void>;
  isSavingSelectionAsNote: boolean;
  handleSaveSelectionAsNote: () => Promise<void>;
  highlights: Highlight[];
  handleAddHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => void;
  handleRemoveHighlight: (id: string) => void;
  handleUpdateHighlightNote: (id: string, note: string) => void;
  isEpubSettingsModalOpen: boolean;
  setIsEpubSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  epubDefaults: { title: string; filename: string; source: 'selection' | 'view' } | null;
  handleConfirmGenerateEbook: (title: string, filename: string) => Promise<void>;
  isRefreshOptionsModalOpen: boolean;
  setIsRefreshOptionsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  refreshModalInitialState: { favoritesOnly?: boolean } | null;
  handleOpenRefreshOptionsModal: (initialState?: { favoritesOnly?: boolean }) => void;
  handleExecuteRefresh: (options: RefreshOptions) => Promise<void>;
  handleQuotaError: (options?: { source: 'auto' | 'manual' }) => void;
  handleSuccessfulApiCall: () => void;
  isAiDisabled: boolean;
  aiHierarchy: MindmapHierarchy | null;
  ytAiHierarchy: MindmapHierarchy | null;
  setYtAiHierarchy: React.Dispatch<React.SetStateAction<MindmapHierarchy | null>>;
  nonYtAiHierarchy: MindmapHierarchy | null;
  setNonYtAiHierarchy: React.Dispatch<React.SetStateAction<MindmapHierarchy | null>>;
  setAiHierarchy: React.Dispatch<React.SetStateAction<MindmapHierarchy | null>>;
  isAiTopicsCollapsed: boolean;
  onToggleAiTopicsCollapse: () => void;
  isTestingSources: boolean;
  sourceTestResults: SourceTestResult[];
  handleTestAllSources: () => Promise<void>;
}
const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const AppProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [feeds, setFeeds] = useState<Feed[]>(() => {
    const storedFeeds = getStoredData<Feed[]>(FEEDS_STORAGE_KEY, []);
    return storedFeeds.map(feed => ({
      ...feed,
      items: feed.items || [],
    }));
  });
  const [articleTags, setArticleTags] = useState<Map<string, string[]>>(() =>
    getStoredData(ARTICLE_TAGS_KEY, new Map(), (k, v) =>
      k === '' ? new Map(Array.isArray(v) ? v : undefined) : v
    )
  );
  const [readLaterOrderYt, setReadLaterOrderYt] = useState<string[]>(() =>
    getStoredData(READ_LATER_ORDER_YT_KEY, [])
  );
  const [readLaterOrderRss, setReadLaterOrderRss] = useState<string[]>(() =>
    getStoredData(READ_LATER_ORDER_RSS_KEY, [])
  );
  const [tagOrders, setTagOrders] = useState<Record<string, string[]>>(() =>
    getStoredData(TAG_ORDERS_KEY, {})
  );
  const [favoritesOrderYt, setFavoritesOrderYt] = useState<string[]>(() =>
    getStoredData(FAVORITES_ORDER_YT_KEY, [])
  );
  const [favoritesOrderRss, setFavoritesOrderRss] = useState<string[]>(() =>
    getStoredData(FAVORITES_ORDER_RSS_KEY, [])
  );
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [isViewLoading, setIsViewLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [currentView, setCurrentView] = useState<CurrentView>(getInitialView);
  const [backgroundView, setBackgroundView] = useState<CurrentView>(() => {
    const initialView = getInitialView();
    return initialView.type === 'article' ? { type: 'all-subscriptions' } : initialView;
  });
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(() => {
    const initialView = getInitialView();
    return initialView.type === 'feed' ? initialView.value || null : null;
  });
  const [gridZoomLevel, setGridZoomLevel] = useState<GridZoomLevel>(() =>
    getStoredData(GRID_ZOOM_LEVEL_KEY, 'md')
  );
  const [articleZoomLevel, setArticleZoomLevel] = useState<GridZoomLevel>(() =>
    getStoredData(ARTICLE_ZOOM_LEVEL_KEY, 'md')
  );
  const [articleViewMode, setArticleViewMode] = useState<ArticleViewMode>(() =>
    getStoredData(ARTICLE_VIEW_MODE_KEY, 'grid')
  );
  const [readArticleIds, setReadArticleIds] =
    useState<Map<string, number>>(getPrunedReadArticleIds);
  const [likedVideoIds, setLikedVideoIds] = useState<Set<string>>(() =>
    getStoredData(LIKED_YOUTUBE_VIDEOS_KEY, new Set(), (k, v) =>
      k === '' ? new Set(Array.isArray(v) ? v : undefined) : v
    )
  );
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    const token = localStorage.getItem('gapi_access_token');
    const expiresAt = localStorage.getItem('gapi_access_token_expires_at');

    // Helper to check if token is expired
    const isExpired = (expiresAtStr: string | null): boolean => {
      if (!expiresAtStr) return true;
      return Date.now() >= parseInt(expiresAtStr, 10);
    };

    if (token && expiresAt && !isExpired(expiresAt)) {
      return token;
    }

    // Clear expired or invalid tokens
    localStorage.removeItem('gapi_access_token');
    localStorage.removeItem('gapi_access_token_expires_at');
    localStorage.removeItem('gapi_user_profile');
    return null;
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() =>
    getStoredData('gapi_user_profile', null)
  );
  const [isImportYouTubeModalOpen, setIsImportYouTubeModalOpen] = useState(false);
  const tokenClientRef = useRef<google.accounts.oauth2.TokenClient | null>(null);
  const queuedLikeRef = useRef<{ article: Article; isAutoLike: boolean } | null>(null);
  const isReAuthingRef = useRef(false);
  const isSilentAuthRef = useRef(false);
  const tokenRefreshTimerRef = useRef<number | null>(null);
  const isRefreshingRef = useRef(false);
  const feedsRef = useRef<Feed[]>(feeds);

  useEffect(() => {
    feedsRef.current = feeds;
  }, [feeds]);

  const handleGoogleSignIn = useCallback(
    (options?: { showConsentPrompt?: boolean; isSilent?: boolean }) => {
      if (tokenClientRef.current) {
        if (options?.isSilent) {
          isSilentAuthRef.current = true;
        }
        const prompt = options?.isSilent ? 'none' : options?.showConsentPrompt ? 'consent' : '';
        tokenClientRef.current.requestAccessToken({ prompt });
      }
    },
    []
  );

  const handleLikeVideo = useCallback(
    async (article: Article, options?: { isAutoLike?: boolean }) => {
      const videoId = getYouTubeId(article.link);
      if (!videoId || likedVideoIds.has(videoId)) return;

      if (!accessToken) {
        if (options?.isAutoLike) {
          return;
        }
        if (!isReAuthingRef.current) {
          isReAuthingRef.current = true;
          queuedLikeRef.current = { article, isAutoLike: false };
          setToast({ message: 'Please sign in to like this video.', type: 'error' });
          handleGoogleSignIn({ showConsentPrompt: true });
        }
        return;
      }

      // Proactive token validation - check if token is expired before API call
      const storedExpiresAt = localStorage.getItem('gapi_access_token_expires_at');
      if (storedExpiresAt && Date.now() >= parseInt(storedExpiresAt, 10)) {
        console.log('Token expired before API call. Attempting refresh...');
        if (!isReAuthingRef.current) {
          isReAuthingRef.current = true;
          queuedLikeRef.current = { article, isAutoLike: options?.isAutoLike || false };
          handleGoogleSignIn({ isSilent: true });
        }
        return;
      }

      try {
        await likeYouTubeVideo(videoId, accessToken);
        setLikedVideoIds(prev => new Set(prev).add(videoId));
      } catch (e: any) {
        if (e.isAuthError) {
          if (options?.isAutoLike) {
            return;
          }
          if (!isReAuthingRef.current) {
            isReAuthingRef.current = true;
            queuedLikeRef.current = { article, isAutoLike: false };
            handleGoogleSignIn({ showConsentPrompt: true });
          }
        } else if (!options?.isAutoLike) {
          setToast({ message: `Could not like video: ${e.message}`, type: 'error' });
        }
      }
    },
    [accessToken, likedVideoIds, handleGoogleSignIn, setToast]
  );

  const handleLikeVideoRef = useRef(handleLikeVideo);
  useEffect(() => {
    handleLikeVideoRef.current = handleLikeVideo;
  }, [handleLikeVideo]);

  const silentRefreshRetryCountRef = useRef(0);

  useEffect(() => {
    const checkGsi = setInterval(() => {
      if (window.google && window.google.accounts) {
        clearInterval(checkGsi);
        const GOOGLE_CLIENT_ID = (window as any).process?.env?.GOOGLE_CLIENT_ID;

        if (!GOOGLE_CLIENT_ID) {
          console.warn('Google Client ID is not configured. Google Sign-In will not be available.');
          return;
        }

        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope:
            'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file',
          callback: async tokenResponse => {
            isReAuthingRef.current = false;

            if (tokenResponse.error) {
              if (
                tokenResponse.error !== 'popup_closed_by_user' &&
                tokenResponse.error !== 'access_denied' &&
                !isSilentAuthRef.current
              ) {
                setToast({
                  message: `Sign-in failed: ${tokenResponse.error_description || tokenResponse.error}`,
                  type: 'error',
                });
              }

              // Handle silent refresh failures - don't retry, just fail silently
              if (isSilentAuthRef.current) {
                // Silent refresh failed - clear auth state without showing popup
                setAccessToken(null);
                setUserProfile(null);
                localStorage.removeItem('gapi_access_token');
                localStorage.removeItem('gapi_access_token_expires_at');
                localStorage.removeItem('gapi_user_profile');
                silentRefreshRetryCountRef.current = 0;
              }

              queuedLikeRef.current = null;
              isSilentAuthRef.current = false;
              return;
            }

            if (tokenResponse.access_token) {
              const newAccessToken = tokenResponse.access_token;
              const expiresIn = (tokenResponse.expires_in || 3600) * 1000;
              const expiresAt = Date.now() + expiresIn;

              localStorage.setItem('gapi_access_token', newAccessToken);
              localStorage.setItem('gapi_access_token_expires_at', expiresAt.toString());
              setAccessToken(newAccessToken);

              // Reset retry counter on successful refresh
              silentRefreshRetryCountRef.current = 0;

              // Setup auto-refresh timer
              if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
              const refreshTimeout = expiresIn - 5 * 60 * 1000; // Refresh 5 minutes before expiry
              tokenRefreshTimerRef.current = window.setTimeout(
                () => {
                  handleGoogleSignIn({ isSilent: true });
                },
                Math.max(refreshTimeout, 0)
              );

              try {
                const profileResponse = await fetch(
                  'https://www.googleapis.com/oauth2/v3/userinfo',
                  {
                    headers: { Authorization: `Bearer ${newAccessToken}` },
                  }
                );
                if (!profileResponse.ok) throw new Error('Failed to fetch user profile.');

                const profile = await profileResponse.json();
                const userProfileData: UserProfile = { email: profile.email };
                setUserProfile(userProfileData);
                localStorage.setItem('gapi_user_profile', JSON.stringify(userProfileData));

                if (!isSilentAuthRef.current) {
                  setToast({ message: `Signed in as ${profile.email}`, type: 'success' });
                }

                if (queuedLikeRef.current) {
                  handleLikeVideoRef.current(queuedLikeRef.current.article, {
                    isAutoLike: queuedLikeRef.current.isAutoLike,
                  });
                  queuedLikeRef.current = null;
                }
              } catch (e) {
                if (!isSilentAuthRef.current) {
                  setToast({
                    message: 'Signed in, but failed to fetch user profile.',
                    type: 'error',
                  });
                }
              } finally {
                isSilentAuthRef.current = false;
              }
            }
          },
        });

        // Auto-refresh token on app load if it exists and is expiring soon
        const storedToken = localStorage.getItem('gapi_access_token');
        const storedExpiresAt = localStorage.getItem('gapi_access_token_expires_at');

        if (storedToken && storedExpiresAt) {
          const expiresAt = parseInt(storedExpiresAt, 10);
          const now = Date.now();
          const fiveMinutes = 5 * 60 * 1000;

          if (now >= expiresAt) {
            // Token is expired, attempt silent refresh
            console.log('Token expired on app load. Attempting silent refresh...');
            setTimeout(() => handleGoogleSignIn({ isSilent: true }), 500);
          } else if (now >= expiresAt - fiveMinutes) {
            // Token is expiring soon, attempt silent refresh
            console.log('Token expiring soon. Attempting silent refresh...');
            setTimeout(() => handleGoogleSignIn({ isSilent: true }), 500);
          } else {
            // Token is still valid, setup refresh timer
            const timeUntilRefresh = expiresAt - now - fiveMinutes;
            tokenRefreshTimerRef.current = window.setTimeout(
              () => {
                handleGoogleSignIn({ isSilent: true });
              },
              Math.max(timeUntilRefresh, 0)
            );
          }
        }
      }
    }, 100);

    return () => clearInterval(checkGsi);
  }, [handleGoogleSignIn]);

  const isImportYouTubeModalOpenRef = useRef(isImportYouTubeModalOpen);
  useEffect(() => {
    isImportYouTubeModalOpenRef.current = isImportYouTubeModalOpen;
  }, [isImportYouTubeModalOpen]);

  const [readLaterArticleIds, setReadLaterArticleIds] = useState<Set<string>>(() =>
    getStoredData(READ_LATER_KEY, new Set(), (k, v) =>
      k === '' ? new Set(Array.isArray(v) ? v : undefined) : v
    )
  );
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (window.innerWidth < 768) return true;
    return getStoredData(SIDEBAR_COLLAPSED_KEY, false);
  });
  const [sidebarTab, setSidebarTab] = useState<'yt' | 'rss'>(() =>
    getStoredData(SIDEBAR_TAB_KEY, 'yt')
  );
  const [sidebarFeedsView, setSidebarFeedsView] = useState<SidebarFeedsView>(() =>
    getStoredData(SIDEBAR_FEEDS_VIEW_KEY, 'list')
  );
  const [isViewsCollapsed, setIsViewsCollapsed] = useState<boolean>(() =>
    getStoredData(VIEWS_COLLAPSED_KEY, false)
  );
  const [isYoutubeFeedsCollapsed, setIsYoutubeFeedsCollapsed] = useState<boolean>(() =>
    getStoredData(YOUTUBE_FEEDS_COLLAPSED_KEY, true)
  );
  const [isYoutubePlaylistsCollapsed, setIsYoutubePlaylistsCollapsed] = useState<boolean>(() =>
    getStoredData(YOUTUBE_PLAYLISTS_COLLAPSED_KEY, true)
  );
  const [isRedditFeedsCollapsed, setIsRedditFeedsCollapse] = useState<boolean>(() =>
    getStoredData(REDDIT_FEEDS_COLLAPSED_KEY, true)
  );
  const [isRssFeedsCollapsed, setIsRssFeedsCollapse] = useState<boolean>(() =>
    getStoredData(RSS_FEEDS_COLLAPSED_KEY, true)
  );
  const [isTagsCollapsed, setIsTagsCollapsed] = useState<boolean>(() =>
    getStoredData(TAGS_COLLAPSED_KEY, true)
  );
  const [isYoutubeTagsCollapsed, setIsYoutubeTagsCollapsed] = useState<boolean>(() =>
    getStoredData(YOUTUBE_TAGS_COLLAPSED_KEY, true)
  );
  const [isRssTagsCollapsed, setIsRssTagsCollapsed] = useState<boolean>(() =>
    getStoredData(RSS_TAGS_COLLAPSED_KEY, true)
  );
  const [expandedTags, setExpandedTags] = useState<Set<string>>(() =>
    getStoredData(EXPANDED_TAGS_KEY, new Set(), (k, v) =>
      k === '' ? new Set(Array.isArray(v) ? v : undefined) : v
    )
  );
  const [expandedViews, setExpandedViews] = useState<Set<string>>(() =>
    getStoredData(EXPANDED_VIEWS_KEY, new Set(), (k, v) =>
      k === '' ? new Set(Array.isArray(v) ? v : undefined) : v
    )
  );
  const [isAddFeedModalOpen, setAddFeedModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSyncDataModalOpen, setIsSyncDataModalOpen] = useState(false);
  const [isExportTextModalOpen, setIsExportTextModalOpen] = useState(false);
  const [exportTextContent, setExportTextContent] = useState('');
  const [isAdvancedInfoModalOpen, setIsAdvancedInfoModalOpen] = useState(false);
  const [isAiSettingsModalOpen, setIsAiSettingsModalOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isImportTextModalOpen, setIsImportTextModalOpen] = useState(false);
  const [isProxyStatsModalOpen, setIsProxyStatsModalOpen] = useState(false);
  const [isCacheInfoModalOpen, setIsCacheInfoModalOpen] = useState(false);
  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
  const [proxyStats, setProxyStats] = useState<ProxyStats>(() =>
    getStoredData(PROXY_STATS_KEY, {})
  );
  const [disabledProxies, setDisabledProxies] = useState<Set<string>>(() =>
    getStoredData(DISABLED_PROXIES_KEY, new Set(), (k, v) =>
      k === '' ? new Set(Array.isArray(v) ? v : undefined) : v
    )
  );
  const [feedToEdit, setFeedToEdit] = useState<Feed | null>(null);
  const [feedToEditTags, setFeedToEditTags] = useState<Feed | null>(null);
  const [isDigestConfigModalOpen, setIsDigestConfigModalOpen] = useState(false);
  const [articlesForDigest, setArticlesForDigest] = useState<Article[]>([]);
  const [initialDigestLanguage, setInitialDigestLanguage] = useState('original');
  const [isDigestModalOpen, setIsDigestModalOpen] = useState(false);
  const [digestState, setDigestState] = useState<DigestState>({
    digest: null,
    type: null,
    error: null,
    isLoading: false,
    loadingMessage: null,
  });
  const [isRecommendationsModalOpen, setIsRecommendationsModalOpen] = useState(false);
  const [recommendationsState, setRecommendationsState] = useState<{
    recommendations: RecommendedFeed[] | null;
    error: string | null;
    isLoading: boolean;
  }>({ recommendations: null, error: null, isLoading: false });
  const [isRelatedModalOpen, setIsRelatedModalOpen] = useState(false);
  const [relatedSourceFeedId, setRelatedSourceFeedId] = useState<string | null>(null);
  const [relatedChannelsState, setRelatedChannelsState] = useState<{
    recommendations: RecommendedFeed[] | null;
    error: string | null;
    isLoading: boolean;
  }>({ recommendations: null, error: null, isLoading: false });
  const [bulkEditModalConfig, setBulkEditModalConfig] = useState<BulkEditModalConfig>({
    isOpen: false,
    mode: 'add',
    tag: undefined,
  });
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshingFeedId, setRefreshingFeedId] = useState<string | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<number | null>(null);
  const [inactivePeriod, setInactivePeriod] = useState<1 | 3 | 6 | 12 | 'all'>(3);
  const [autoplayMode, setAutoplayMode] = useState<AutoplayMode>(() =>
    getStoredData(AUTOPLAY_MODE_KEY, 'off')
  );
  const [autoLikeYouTubeVideos, setAutoLikeYouTubeVideos] = useState<boolean>(() =>
    getStoredData(AUTO_LIKE_YOUTUBE_VIDEOS_KEY, false)
  );
  const [autoLikeDelaySeconds, setAutoLikeDelaySeconds] = useState<number>(() =>
    getStoredData(AUTO_LIKE_DELAY_SECONDS_KEY, 10)
  );
  const [autoUploadAfterRefresh, setAutoUploadAfterRefresh] = useState<boolean>(() =>
    getStoredData(AUTO_UPLOAD_AFTER_REFRESH_KEY, false)
  );
  const [autoSummarizeOnRefresh, setAutoSummarizeOnRefresh] = useState<boolean>(() =>
    getStoredData(AUTO_SUMMARIZE_ON_REFRESH_KEY, false)
  );
  const [autoClusterOnRefresh, setAutoClusterOnRefresh] = useState<boolean>(() =>
    getStoredData(AUTO_CLUSTER_ON_REFRESH_KEY, false)
  );
  const [autoTranscribeOnRefresh, setAutoTranscribeOnRefresh] = useState(() =>
    getStoredData(AUTO_TRANSCRIBE_ON_REFRESH_KEY, false)
  );
  const [autoAiTimeWindowDays, setAutoAiTimeWindowDays] = useState<number>(() =>
    getStoredData(AUTO_AI_TIME_WINDOW_DAYS_KEY, 3)
  );
  const [enableRssAndReddit, setEnableRssAndReddit] = useState<boolean>(() =>
    getStoredData(ENABLE_RSS_REDDIT_KEY, true)
  );
  const [defaultAiLanguage, setDefaultAiLanguage] = useState<string>(() =>
    getStoredData(DEFAULT_AI_LANGUAGE_KEY, 'original')
  );
  const [personalInterests, setPersonalInterests] = useState<string[]>(() =>
    getStoredData('media-feeder-personal-interests', [])
  );
  const [urlFromExtension, setUrlFromExtension] = useState<string | null>(null);
  const [isProcessingUrl, setIsProcessingUrl] = useState(false);
  const [refreshBatchSize, setRefreshBatchSize] = useState<number>(() =>
    getStoredData(REFRESH_BATCH_SIZE_KEY, 50)
  );
  const [refreshDelaySeconds, setRefreshDelaySeconds] = useState<number>(() =>
    getStoredData(REFRESH_DELAY_SECONDS_KEY, 10)
  );
  const [commentsState, setCommentsState] = useState<CommentState>({
    comments: null,
    isLoading: false,
    error: null,
  });
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [recentShareCodes, setRecentShareCodes] = useState<string[]>(() =>
    getStoredData(RECENT_SHARE_CODES_KEY, [])
  );
  const [importCodeFromUrl, setImportCodeFromUrl] = useState<string | null>(null);
  const [isBundledChannelsModalOpen, setIsBundledChannelsModalOpen] = useState(false);
  const [youTubeImportState, setYouTubeImportState] = useState<YouTubeImportState>({
    status: 'idle',
    subscriptions: [],
    error: null,
  });
  const [isResolvingArticleUrl, setIsResolvingArticleUrl] = useState(false);
  const [videoToAdd, setVideoToAdd] = useState<Article | null>(null);
  const [articleToEditTags, setArticleToEditTags] = useState<Article | null>(null);
  const [isBulkEditArticleTagsModalOpen, setIsBulkEditArticleTagsModalOpen] = useState(false);
  const [selectedArticleIdsForBatch, setSelectedArticleIdsForBatch] = useState<Set<string>>(
    new Set()
  );
  const [isTrendingKeywordsModalOpen, setIsTrendingKeywordsModalOpen] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [hasEnteredApp, setHasEnteredApp] = useState<boolean>(() =>
    getStoredData(HAS_ENTERED_KEY, false)
  );
  const [isGeneratingEbook, setIsGeneratingEbook] = useState<boolean>(false);
  const [isGeneratingEbookFromView, setIsGeneratingEbookFromView] = useState<boolean>(false);
  const [isSavingViewAsNote, setIsSavingViewAsNote] = useState(false);
  const [isSavingSelectionAsNote, setIsSavingSelectionAsNote] = useState(false);
  const [isGeneratingSummaries, setIsGeneratingSummaries] = useState(false);
  const [summaryGenerationProgress, setSummaryGenerationProgress] = useState<number | null>(null);
  const [driveSyncStatus, setDriveSyncStatus] = useState<DriveSyncStatus>({ status: 'checking' });
  const [triggerAutoUpload, setTriggerAutoUpload] = useState<boolean>(false);
  const [notes, setNotes] = useState<Note[]>(() => getStoredData(NOTES_KEY, []));
  const [highlights, setHighlights] = useState<Highlight[]>(() => getStoredData(HIGHLIGHTS_KEY, []));
  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>(() =>
    getStoredData(NOTE_FOLDERS_KEY, [])
  );
  const [isNoteEditorModalOpen, setIsNoteEditorModalOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  const [initialNoteContent, setInitialNoteContent] = useState<{
    title: string;
    content: string;
    sourceArticleIds: { feedId: string; articleId: string }[];
  } | null>(null);
  const [isNotesCollapsed, setIsNotesCollapsed] = useState<boolean>(() =>
    getStoredData(NOTES_COLLAPSED_KEY, true)
  );
  const [isEpubSettingsModalOpen, setIsEpubSettingsModalOpen] = useState(false);
  const [articlesForEpub, setArticlesForEpub] = useState<Article[]>([]);
  const [epubDefaults, setEpubDefaults] = useState<{
    title: string;
    filename: string;
    source: 'selection' | 'view';
  } | null>(null);

  const [aiHierarchy, setAiHierarchy] = useState<MindmapHierarchy | null>(() =>
    getStoredData('media-feeder-ai-hierarchy', null)
  );
  const [ytAiHierarchy, setYtAiHierarchy] = useState<MindmapHierarchy | null>(() =>
    getStoredData('media-feeder-yt-ai-hierarchy', null)
  );
  const [nonYtAiHierarchy, setNonYtAiHierarchy] = useState<MindmapHierarchy | null>(() =>
    getStoredData('media-feeder-non-yt-ai-hierarchy', null)
  );
  const [isAiTopicsCollapsed, setIsAiTopicsCollapsed] = useState<boolean>(() =>
    getStoredData('media-feeder-ai-topics-collapsed', false)
  );
  const [trendingKeywords, setTrendingKeywords] = useState<
    Array<{ keyword: string; count: number }>
  >(() => {
    const stored = getStoredData<any>(TRENDING_KEYWORDS_KEY, []);
    if (Array.isArray(stored) && stored.length > 0 && typeof stored[0] === 'string') {
      localStorage.removeItem(TRENDING_KEYWORDS_KEY);
      return [];
    }
    return stored;
  });
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [keywordGenerationError, setKeywordGenerationError] = useState<string | null>(null);
  const isGeneratingKeywordsRef = useRef(false);
  const trendingKeywordsRef = useRef(trendingKeywords);
  const [isAiDisabled, setIsAiDisabled] = useState<boolean>(() =>
    getStoredData(AI_DISABLED_KEY, false)
  );
  const [isTestingSources, setIsTestingSources] = useState(false);
  const [sourceTestResults, setSourceTestResults] = useState<SourceTestResult[]>([]);

  const handleTestAllSources = useCallback(async () => {
    setIsTestingSources(true);
    setSourceTestResults([]);
    try {
      await testAllSources(result => {
        setSourceTestResults(prev => [...prev, result]);
      });
    } catch (e: any) {
      setToast({ message: `Testing failed: ${e.message}`, type: 'error' });
    } finally {
      setIsTestingSources(false);
    }
  }, [setToast]);
  useEffect(() => {
    trendingKeywordsRef.current = trendingKeywords;
  }, [trendingKeywords]);

  // AI hierarchy persistence is handled by consolidated debounced effect below

  const [isRefreshOptionsModalOpen, setIsRefreshOptionsModalOpen] = useState(false);
  const [refreshModalInitialState, setRefreshModalInitialState] = useState<{
    favoritesOnly?: boolean;
  } | null>(null);

  const aiModel: AiModel = AVAILABLE_MODELS[0];

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      setIsMobileView(isMobile);
      if (isMobile) {
        setIsSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const feedsToShowInApp = useMemo(() => {
    if (enableRssAndReddit) return feeds;
    return feeds.filter(feed => {
      const isYouTube = feed.url.toLowerCase().includes('youtube.com');
      const isBilibili = feed.url.toLowerCase().includes('bilibili.com');
      return isYouTube || isBilibili;
    });
  }, [feeds, enableRssAndReddit]);

  const sortedFeeds = useMemo(() => {
    return [...feedsToShowInApp].sort((a, b) => {
      const aIsFavorite = a.isFavorite ? 0 : 1;
      const bIsFavorite = b.isFavorite ? 0 : 1;
      if (aIsFavorite !== bIsFavorite) return aIsFavorite - bIsFavorite;
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    });
  }, [feedsToShowInApp]);
  const favoriteFeeds = useMemo(() => sortedFeeds.filter(f => f.isFavorite), [sortedFeeds]);

  const allArticles: Article[] = useMemo(() => {
    return feedsToShowInApp.flatMap(feed => {
      const feedTags = new Set(feed.tags || []);
      const isReddit = feed.url.toLowerCase().includes('reddit.com');
      return feed.items.map(item => {
        const articleSpecificTags = new Set(articleTags.get(item.id) || []);
        const allCurrentTags = new Set([...feedTags, ...articleSpecificTags]);
        return {
          ...item,
          feedId: feed.id,
          tags: allCurrentTags.size > 0 ? Array.from(allCurrentTags).sort() : undefined,
          isReddit: isReddit,
        };
      });
    });
  }, [feedsToShowInApp, articleTags]);

  const feedsById = useMemo(
    () => new Map(feedsToShowInApp.map(feed => [feed.id, feed])),
    [feedsToShowInApp]
  );
  const articlesById = useMemo(
    () => new Map(deduplicateArticles(allArticles).map(article => [article.id, article])),
    [allArticles]
  );

  // MiniSearch full-text index — rebuilds when articles change (debounced)
  const searchIndexReadyRef = React.useRef(false);
  useEffect(() => {
    searchIndexReadyRef.current = false;
    buildSearchIndex(deduplicateArticles(allArticles));
    // The index build is debounced; mark ready after debounce + a tick
    const timer = setTimeout(() => {
      searchIndexReadyRef.current = true;
    }, 400);
    return () => clearTimeout(timer);
  }, [allArticles]);

  const handleFetchComments = useCallback(async (videoId: string) => {
    setCommentsState({ comments: null, isLoading: true, error: null });
    try {
      const comments = await fetchYouTubeComments(videoId);
      setCommentsState({ comments, isLoading: false, error: null });
    } catch (e: any) {
      setCommentsState({ comments: null, isLoading: false, error: e.message });
    }
  }, []);

  const handleFetchArticleDetails = useCallback(
    async (articleId: string) => {
      try {
        const article = articlesById.get(articleId);
        const videoId = getYouTubeId(article?.link || null);

        if (!videoId) {
          return;
        }

        const { description, views } = await fetchYouTubeVideoDetails(videoId);

        // Auto-download transcript
        let transcriptText: string | undefined = undefined;
        try {
          const choices = await fetchAvailableCaptionChoices(videoId);
          if (choices.length > 0) {
            const transcriptLines = await fetchAndParseTranscript(choices[0].url);
            if (transcriptLines.length > 0) {
              // Store transcript as formatted text in the content
              transcriptText = transcriptLines
                .map(line => `[${formatTranscriptTime(line.start)}] ${line.text}`)
                .join('\n');
            }
          }
        } catch (e) {
          console.warn(`Could not auto-download transcript for video ${videoId}:`, e);
          // Continue without transcript - not a critical error
        }

        setFeeds(prevFeeds => {
          return prevFeeds.map(feed => {
            const itemIndex = feed.items.findIndex(item => item.id === articleId);
            if (itemIndex > -1) {
              const newItems = [...feed.items];
              const updatedItem = {
                ...newItems[itemIndex],
                content: transcriptText || description,
                description: description,
                views: views,
              };
              newItems[itemIndex] = updatedItem;
              return { ...feed, items: newItems };
            }
            return feed;
          });
        });

        setSelectedArticle(prevArticle => {
          if (prevArticle?.id === articleId) {
            return {
              ...prevArticle,
              content: transcriptText || description,
              description,
              views: views,
            };
          }
          return prevArticle;
        });
      } catch (e: any) {
        setToast({ message: `Could not load video details: ${e.message}`, type: 'error' });
      }
    },
    [articlesById, setToast]
  );

  const handleGenerateTrendingKeywords = useCallback(
    async (forceRefresh = false) => {
      if (isGeneratingKeywordsRef.current) return;
      if (!forceRefresh && trendingKeywordsRef.current.length > 0) {
        return;
      }

      isGeneratingKeywordsRef.current = true;
      setIsGeneratingKeywords(true);
      setKeywordGenerationError(null);

      try {
        const textCorpus = allArticles
          .map(article => {
            const title = article.title || '';
            return title.replace(/<[^>]*>?/gm, ' ');
          })
          .join('\n\n');

        if (textCorpus.length < 100) {
          throw new Error(
            'Not enough content from downloaded article titles to generate keywords.'
          );
        }

        let words: string[];

        if ('Intl' in window && 'Segmenter' in (window as any).Intl) {
          const segmenter = new (window as any).Intl.Segmenter(undefined, { granularity: 'word' });
          words = Array.from(segmenter.segment(textCorpus.toLowerCase()))
            .filter((s: any) => s.isWordLike)
            .map((s: any) => s.segment);
        } else {
          words = textCorpus
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean);
        }

        const stopWords = new Set([
          'a',
          'about',
          'above',
          'after',
          'again',
          'against',
          'all',
          'am',
          'an',
          'and',
          'any',
          'are',
          "aren't",
          'as',
          'at',
          'be',
          'because',
          'been',
          'before',
          'being',
          'below',
          'between',
          'both',
          'but',
          'by',
          "can't",
          'cannot',
          'could',
          "couldn't",
          'did',
          "didn't",
          'do',
          'does',
          "doesn't",
          'doing',
          "don't",
          'down',
          'during',
          'each',
          'few',
          'for',
          'from',
          'further',
          'had',
          "hadn't",
          'has',
          "hasn't",
          'have',
          "haven't",
          'having',
          'he',
          "he'd",
          "he'll",
          "he's",
          'her',
          'here',
          "here's",
          'hers',
          'herself',
          'him',
          'himself',
          'his',
          'how',
          "how's",
          'i',
          "i'd",
          "i'll",
          "i'm",
          "i've",
          'if',
          'in',
          'into',
          'is',
          "isn't",
          'it',
          "it's",
          'its',
          'itself',
          "let's",
          'me',
          'more',
          'most',
          "mustn't",
          'my',
          'myself',
          'no',
          'nor',
          'not',
          'of',
          'off',
          'on',
          'once',
          'only',
          'or',
          'other',
          'ought',
          'our',
          'ours',
          'ourselves',
          'out',
          'over',
          'own',
          'same',
          "shan't",
          'she',
          "she'd",
          "she'll",
          "she's",
          'should',
          "shouldn't",
          'so',
          'some',
          'such',
          'than',
          'that',
          "that's",
          'the',
          'their',
          'theirs',
          'them',
          'themselves',
          'then',
          'there',
          "there's",
          'these',
          'they',
          "they'd",
          "they'll",
          "they're",
          "they've",
          'this',
          'those',
          'through',
          'to',
          'too',
          'under',
          'until',
          'up',
          'very',
          'was',
          "wasn't",
          'we',
          "we'd",
          "we'll",
          "we're",
          "we've",
          'were',
          "weren't",
          'what',
          "what's",
          'when',
          "when's",
          'where',
          "where's",
          'which',
          'while',
          'who',
          "who's",
          'whom',
          'why',
          "why's",
          'with',
          "won't",
          'would',
          "wouldn't",
          'you',
          "you'd",
          "you'll",
          "you're",
          "you've",
          'your',
          'yours',
          'yourself',
          'yourselves',
          'new',
          'video',
          'youtube',
          'rss',
          'feed',
          'post',
          'posts',
          'article',
          'articles',
          'channel',
          'channels',
          'review',
          'update',
          'updates',
          'watch',
          'read',
          'official',
          'latest',
          'news',
          'daily',
          'weekly',
          'monthly',
          'part',
          'episode',
          'one',
          'two',
          'three',
          'four',
          'five',
          'six',
          'seven',
          'eight',
          'nine',
          'ten',
          'vs',
          're',
          'vs.',
          'ft.',
          'feat',
        ]);

        const filteredWords = words.filter(
          word => !stopWords.has(word) && word.length > 1 && !/^\d+$/.test(word)
        );

        const wordFrequencies: { [key: string]: number } = {};
        for (const word of filteredWords) {
          wordFrequencies[word] = (wordFrequencies[word] || 0) + 1;
        }

        const sortedKeywordsWithCounts = Object.entries(wordFrequencies)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 500)
          .map(([word, count]) => ({ keyword: word, count }));

        const keywords = sortedKeywordsWithCounts;

        if (isGeneratingKeywordsRef.current) {
          setTrendingKeywords(keywords);
        }
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'An unknown error occurred while extracting keywords.';
        if (isGeneratingKeywordsRef.current) {
          setKeywordGenerationError(message);
        }
        console.error(`[Keywords] Keyword extraction failed:`, e);
      } finally {
        isGeneratingKeywordsRef.current = false;
        setIsGeneratingKeywords(false);
      }
    },
    [allArticles]
  );

  useEffect(() => {
    if (allArticles.length > 0) {
      handleGenerateTrendingKeywords(true);
    }
  }, [allArticles, handleGenerateTrendingKeywords]);

  const { youtubeTags, rssTags, allTags } = useMemo(() => {
    const youtubeTagsSet = new Set<string>();
    const rssTagsSet = new Set<string>();

    const processItemTags = (tags: string[] | undefined, isYouTube: boolean) => {
      if (tags) {
        tags.forEach(tag => {
          if (isYouTube) {
            youtubeTagsSet.add(tag);
          } else {
            rssTagsSet.add(tag);
          }
        });
      }
    };

    feedsToShowInApp.forEach(feed => {
      const isYouTube = feed.url.toLowerCase().includes('youtube.com');
      processItemTags(feed.tags, isYouTube);
    });

    for (const [articleId, tags] of articleTags.entries()) {
      const article = articlesById.get(articleId);
      if (article) {
        const feed = feedsById.get(article.feedId);
        if (feed) {
          const isYouTube = feed.url.toLowerCase().includes('youtube.com');
          tags.forEach(tag => {
            if (isYouTube) {
              youtubeTagsSet.add(tag);
            } else {
              rssTagsSet.add(tag);
            }
          });
        }
      }
    }

    const sortedYoutubeTags = Array.from(youtubeTagsSet).sort();
    const sortedRssTags = Array.from(rssTagsSet).sort();
    const allTagsSet = new Set([...sortedYoutubeTags, ...sortedRssTags]);

    return {
      youtubeTags: sortedYoutubeTags,
      rssTags: sortedRssTags,
      allTags: Array.from(allTagsSet).sort(),
    };
  }, [feedsToShowInApp, articleTags, articlesById, feedsById]);

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const feed of feedsToShowInApp) {
      counts[feed.id] = feed.items.filter(item => !readArticleIds.has(item.id)).length;
    }
    return counts;
  }, [feedsToShowInApp, readArticleIds]);

  const feedsByTag = useMemo(() => {
    const map = new Map<string, Feed[]>();
    const feedIdsByTag = new Map<string, Set<string>>();

    sortedFeeds.forEach(feed => {
      (feed.tags || []).forEach(tag => {
        if (!feedIdsByTag.has(tag)) feedIdsByTag.set(tag, new Set());
        feedIdsByTag.get(tag)!.add(feed.id);
      });
      feed.items.forEach(item => {
        const articleSpecificTags = articleTags.get(item.id);
        (articleSpecificTags || []).forEach(tag => {
          if (!feedIdsByTag.has(tag)) feedIdsByTag.set(tag, new Set());
          feedIdsByTag.get(tag)!.add(feed.id);
        });
      });
    });

    for (const [tag, feedIds] of feedIdsByTag.entries()) {
      const feedsForThisTag = sortedFeeds.filter(feed => feedIds.has(feed.id));
      if (feedsForThisTag.length > 0) {
        map.set(tag, feedsForThisTag);
      }
    }

    return map;
  }, [sortedFeeds, articleTags]);

  const { youtubeUnreadTagCounts, rssUnreadTagCounts } = useMemo(() => {
    const ytCounts: Record<string, number> = {};
    const rssCounts: Record<string, number> = {};
    const ytUnreadArticleIdsByTag = new Map<string, Set<string>>();
    const rssUnreadArticleIdsByTag = new Map<string, Set<string>>();

    const unreadArticles = allArticles.filter(a => !readArticleIds.has(a.id));

    unreadArticles.forEach(article => {
      const feed = feedsById.get(article.feedId);
      if (feed && article.tags) {
        const isYouTube = feed.url.toLowerCase().includes('youtube.com');
        const targetMap = isYouTube ? ytUnreadArticleIdsByTag : rssUnreadArticleIdsByTag;

        article.tags.forEach(tag => {
          if (!targetMap.has(tag)) {
            targetMap.set(tag, new Set());
          }
          targetMap.get(tag)!.add(article.id);
        });
      }
    });

    for (const [tag, articleIds] of ytUnreadArticleIdsByTag.entries()) {
      ytCounts[tag] = articleIds.size;
    }
    for (const [tag, articleIds] of rssUnreadArticleIdsByTag.entries()) {
      rssCounts[tag] = articleIds.size;
    }

    return { youtubeUnreadTagCounts: ytCounts, rssUnreadTagCounts: rssCounts };
  }, [allArticles, readArticleIds, feedsById]);

  const {
    unreadPublishedTodayYtCount,
    unreadPublishedTodayRssCount,
    unreadReadLaterYtCount,
    unreadReadLaterRssCount,
    historyYtCount,
    historyRssCount,
    unreadFavoritesYtCount,
    unreadFavoritesRssCount,
    unreadAiSummaryYtCount,
  } = useMemo(() => {
    const isYouTube = (url: string) => url.toLowerCase().includes('youtube.com');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    let ptYt = 0,
      ptRss = 0,
      rlYt = 0,
      rlRss = 0,
      hYt = 0,
      hRss = 0,
      fYt = 0,
      fRss = 0;
    let unreadAiSummaryYt = 0;
    let unreadTranscriptYt = 0;
    const favoriteFeedIds = new Set(favoriteFeeds.map(f => f.id));

    const unreadArticles = allArticles.filter(a => !readArticleIds.has(a.id));

    for (const article of unreadArticles) {
      const feed = feedsById.get(article.feedId);
      if (!feed) continue;

      const isYtFeed = isYouTube(feed.url);

      if (article.pubDateTimestamp && article.pubDateTimestamp >= todayTimestamp) {
        if (isYtFeed) ptYt++;
        else ptRss++;
      }
      if (readLaterArticleIds.has(article.id)) {
        if (isYtFeed) rlYt++;
        else rlRss++;
      }
      if (favoriteFeedIds.has(article.feedId)) {
        if (isYtFeed) fYt++;
        else fRss++;
      }
      if (isYtFeed) {
        if (article.summary || article.structuredSummary) {
          unreadAiSummaryYt++;
        }
        if (article.transcript && article.transcript.length > 0) {
          unreadTranscriptYt++;
        }
      }
    }

    const readArticles = Array.from(readArticleIds.keys())
      .map(id => articlesById.get(id))
      .filter((a): a is Article => !!a);
    for (const article of readArticles) {
      const feed = feedsById.get(article.feedId);
      if (!feed) continue;
      if (isYouTube(feed.url)) hYt++;
      else hRss++;
    }

    return {
      unreadPublishedTodayYtCount: ptYt,
      unreadPublishedTodayRssCount: ptRss,
      unreadReadLaterYtCount: rlYt,
      unreadReadLaterRssCount: rlRss,
      historyYtCount: hYt,
      historyRssCount: hRss,
      unreadFavoritesYtCount: fYt,
      unreadFavoritesRssCount: fRss,
      unreadAiSummaryYtCount: unreadAiSummaryYt,
      unreadTranscriptYtCount: unreadTranscriptYt,
    };
  }, [allArticles, readArticleIds, readLaterArticleIds, favoriteFeeds, feedsById, articlesById]);

  const unreadPublishedTodayCount = unreadPublishedTodayYtCount + unreadPublishedTodayRssCount;
  const unreadReadLaterCount = unreadReadLaterYtCount + unreadReadLaterRssCount;
  const historyCount = historyYtCount + historyRssCount;
  const unreadFavoritesCount = unreadFavoritesYtCount + unreadFavoritesRssCount;

  const {
    feedsForPublishedToday,
    feedsForReadLater,
    feedsForHistory,
    unreadCountsForPublishedToday,
    unreadCountsForReadLater,
  } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const isYouTubeFeed = (feed: Feed): boolean => feed.url.toLowerCase().includes('youtube.com');

    const ptFeeds = new Map<string, Feed>();
    const rlFeeds = new Map<string, Feed>();
    const hFeeds = new Map<string, Feed>();

    const ptUnreadCountsByCanonicalKey: Record<string, number> = {};
    const rlUnreadCountsByCanonicalKey: Record<string, number> = {};

    for (const article of allArticles) {
      const feed = feedsById.get(article.feedId);
      if (!feed) continue;

      const canonicalKey = isYouTubeFeed(feed) && feed.channelUrl ? feed.channelUrl : feed.id;

      if (article.pubDateTimestamp && article.pubDateTimestamp >= todayTimestamp) {
        if (!ptFeeds.has(canonicalKey)) {
          ptFeeds.set(canonicalKey, feed);
        }
        if (!readArticleIds.has(article.id)) {
          ptUnreadCountsByCanonicalKey[canonicalKey] =
            (ptUnreadCountsByCanonicalKey[canonicalKey] || 0) + 1;
        }
      }

      if (readLaterArticleIds.has(article.id)) {
        if (!rlFeeds.has(canonicalKey)) {
          rlFeeds.set(canonicalKey, feed);
        }
        if (!readArticleIds.has(article.id)) {
          rlUnreadCountsByCanonicalKey[canonicalKey] =
            (rlUnreadCountsByCanonicalKey[canonicalKey] || 0) + 1;
        }
      }

      if (readArticleIds.has(article.id)) {
        if (!hFeeds.has(canonicalKey)) {
          hFeeds.set(canonicalKey, feed);
        }
      }
    }

    const finalPtUnreadCounts: Record<string, number> = {};
    for (const feed of ptFeeds.values()) {
      const canonicalKey = isYouTubeFeed(feed) && feed.channelUrl ? feed.channelUrl : feed.id;
      finalPtUnreadCounts[feed.id] = ptUnreadCountsByCanonicalKey[canonicalKey] || 0;
    }

    const finalRlUnreadCounts: Record<string, number> = {};
    for (const feed of rlFeeds.values()) {
      const canonicalKey = isYouTubeFeed(feed) && feed.channelUrl ? feed.channelUrl : feed.id;
      finalRlUnreadCounts[feed.id] = rlUnreadCountsByCanonicalKey[canonicalKey] || 0;
    }

    return {
      feedsForPublishedToday: Array.from(ptFeeds.values()),
      feedsForReadLater: Array.from(rlFeeds.values()),
      feedsForHistory: Array.from(hFeeds.values()),
      unreadCountsForPublishedToday: finalPtUnreadCounts,
      unreadCountsForReadLater: finalRlUnreadCounts,
    };
  }, [allArticles, feedsById, readArticleIds, readLaterArticleIds]);

  const contentView:
    | 'articles'
    | 'feedsGrid'
    | 'inactiveFeeds'
    | 'feedHealth'
    | 'dump'
    | 'privacyPolicy'
    | 'about'
    | 'help'
    | 'notes' = useMemo(() => {
    if (currentView.type === 'all-subscriptions') return 'feedsGrid';
    if (currentView.type === 'inactive-feeds') return 'inactiveFeeds';
    if (currentView.type === 'feed-health') return 'feedHealth';
    if (currentView.type === 'dump') return 'dump';
    if (currentView.type === 'privacy-policy') return 'privacyPolicy';
    if (currentView.type === 'about') return 'about';
    if (currentView.type === 'help') return 'help';
    if (currentView.type === 'note-folder') return 'notes';
    return 'articles';
  }, [currentView]);

  const youtubeFeeds = useMemo(
    () => sortedFeeds.filter(feed => feed.url.toLowerCase().includes('youtube.com')),
    [sortedFeeds]
  );
  const rssAndOtherFeeds = useMemo(
    () => sortedFeeds.filter(feed => !feed.url.toLowerCase().includes('youtube.com')),
    [sortedFeeds]
  );

  const feedsForGrid = useMemo(() => {
    return sidebarTab === 'yt' ? youtubeFeeds : rssAndOtherFeeds;
  }, [sidebarTab, youtubeFeeds, rssAndOtherFeeds]);

  const { articlesToShow, availableTagsForFilter } = useMemo(() => {
    const viewForFiltering = currentView;
    let rawArticles: Article[] = [];
    let needsDeduplication = false;

    switch (viewForFiltering.type) {
      case 'feed': {
        const feedToDisplay = feedsById.get(viewForFiltering.value || '');
        if (feedToDisplay) {
          const articleIdsInFeed = new Set(feedToDisplay.items.map(i => i.id));
          const taggedItemsMap = new Map(
            allArticles
              .filter(a => a.feedId === viewForFiltering.value && articleIdsInFeed.has(a.id))
              .map(a => [a.id, a])
          );
          rawArticles = feedToDisplay.items.map(item => taggedItemsMap.get(item.id) || item);
        } else {
          rawArticles = [];
        }
        break;
      }
      case 'search':
        if (!viewForFiltering.value) {
          rawArticles = [];
        } else {
          const query = viewForFiltering.value;
          // Use MiniSearch full-text index
          const searchResults = searchArticles(query, 500);
          // Convert search results back to full Article objects
          let matchedIds = new Set(searchResults.map(r => r.id));
          // If index not ready, fall back to basic title/description matching
          if (searchResults.length === 0 && !searchIndexReadyRef.current) {
            const lowerQuery = query.toLowerCase();
            rawArticles = allArticles.filter(
              a =>
                a.title.toLowerCase().includes(lowerQuery) ||
                a.description.toLowerCase().includes(lowerQuery)
            );
          } else {
            rawArticles = allArticles.filter(a => matchedIds.has(a.id));
            // Sort by search score (relevance)
            const scoreMap = new Map(searchResults.map(r => [r.id, r.score]));
            rawArticles.sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));
          }
          // Filter by sidebar tab (yt/rss)
          if (sidebarTab === 'yt') {
            rawArticles = rawArticles.filter(a => {
              const feed = feedsById.get(a.feedId);
              return feed ? feed.url.toLowerCase().includes('youtube.com') : false;
            });
          } else {
            rawArticles = rawArticles.filter(a => {
              const feed = feedsById.get(a.feedId);
              return feed ? !feed.url.toLowerCase().includes('youtube.com') : false;
            });
          }
        }
        needsDeduplication = true;
        break;
      case 'keyword-articles':
        if (!viewForFiltering.value) {
          rawArticles = [];
        } else {
          const query = String(viewForFiltering.value).toLowerCase();
          rawArticles = allArticles.filter(a => (a.title || '').toLowerCase().includes(query));
        }
        needsDeduplication = true;
        break;
      case 'readLater':
        rawArticles = Array.from(readLaterArticleIds)
          .map(id => articlesById.get(id))
          .filter((a): a is Article => !!a);
        break;
      case 'history':
        rawArticles = Array.from(readArticleIds.keys())
          .map(id => articlesById.get(id))
          .filter((a): a is Article => !!a);
        break;
      case 'favorites': {
        const favoriteFeedIds = new Set(favoriteFeeds.map(f => f.id));
        rawArticles = allArticles.filter(a => favoriteFeedIds.has(a.feedId));
        needsDeduplication = true;
        break;
      }
      case 'tag':
        rawArticles = filterArticlesForTag(allArticles, viewForFiltering.value, feedsById);
        needsDeduplication = true;
        break;
      case 'published-today': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        rawArticles = allArticles.filter(
          a => a.pubDateTimestamp && a.pubDateTimestamp >= todayTimestamp
        );
        needsDeduplication = true;
        break;
      }

      case 'ai-summary-yt':
        rawArticles = allArticles.filter(a => a.isVideo && (a.summary || a.structuredSummary));
        needsDeduplication = true;
        break;
      case 'yt-transcripts':
        rawArticles = allArticles.filter(a => a.isVideo && a.transcript && a.transcript.length > 0);
        needsDeduplication = true;
        break;
      case 'ai-topic': {
        let targetIds = new Set<string>();
        const val = viewForFiltering.value;
        if (val && typeof val === 'object' && Array.isArray(val.articleIds)) {
          targetIds = new Set(val.articleIds);
        } else if (typeof val === 'string' && (aiHierarchy || ytAiHierarchy || nonYtAiHierarchy)) {
          const ids = (aiHierarchy ? findArticleIdsForTopic(aiHierarchy, val) : [])
            .concat(ytAiHierarchy ? findArticleIdsForTopic(ytAiHierarchy, val) : [])
            .concat(nonYtAiHierarchy ? findArticleIdsForTopic(nonYtAiHierarchy, val) : []);
          targetIds = new Set(ids);
        } else if (
          val &&
          typeof val === 'object' &&
          val.title &&
          typeof val.title === 'string' &&
          (aiHierarchy || ytAiHierarchy || nonYtAiHierarchy)
        ) {
          // Fallback if articleIds is missing but title is present in object
          const ids = (aiHierarchy ? findArticleIdsForTopic(aiHierarchy, val.title) : [])
            .concat(ytAiHierarchy ? findArticleIdsForTopic(ytAiHierarchy, val.title) : [])
            .concat(nonYtAiHierarchy ? findArticleIdsForTopic(nonYtAiHierarchy, val.title) : []);
          targetIds = new Set(ids);
        }
        rawArticles = allArticles.filter(a => targetIds.has(a.id));
        needsDeduplication = true;
        break;
      }
      default:
        rawArticles = [];
    }

    const tabFilteredArticles = rawArticles.filter(article => {
      const feed = feedsById.get(article.feedId);
      if (!feed) return false;
      const isYouTubeFeed = feed.url.toLowerCase().includes('youtube.com');

      if (sidebarTab === 'yt') {
        return isYouTubeFeed;
      } else {
        return !isYouTubeFeed;
      }
    });

    const sortArticles = (articles: Article[]): Article[] => {
      const sortByCustomOrder = (order: string[]) => {
        const orderMap = new Map(order.map((id, index) => [id, index]));
        return [...articles].sort((a, b) => {
          const aIndex = orderMap.get(a.id);
          const bIndex = orderMap.get(b.id);
          if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
          if (aIndex !== undefined) return 1;
          if (bIndex !== undefined) return -1;
          return (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0);
        });
      };

      if (
        viewForFiltering.type === 'feed' &&
        articles.length > 0 &&
        articles.some(a => a.order !== undefined)
      ) {
        return [...articles].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      }
      if (viewForFiltering.type === 'history') {
        return [...articles].sort(
          (a, b) => (readArticleIds.get(b.id) || 0) - (readArticleIds.get(a.id) || 0)
        );
      }
      if (viewForFiltering.type === 'readLater') {
        const source = viewForFiltering.value || 'yt';
        return sortByCustomOrder(source === 'yt' ? readLaterOrderYt : readLaterOrderRss);
      }
      if (viewForFiltering.type === 'tag') {
        const tagValue = viewForFiltering.value;
        let tagKey: string | undefined;
        if (typeof tagValue === 'object' && tagValue.name && tagValue.type) {
          tagKey = `${tagValue.type}-${tagValue.name}`;
        } else if (typeof tagValue === 'string') {
          tagKey = tagValue;
        }

        if (tagKey) {
          const order = tagOrders[tagKey];
          if (order) return sortByCustomOrder(order);
        }
      }
      if (viewForFiltering.type === 'favorites') {
        const source = viewForFiltering.value || 'yt';
        return sortByCustomOrder(source === 'yt' ? favoritesOrderYt : favoritesOrderRss);
      }
      return [...articles].sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));
    };

    const processedArticles = sortArticles(
      needsDeduplication ? deduplicateArticles(tabFilteredArticles) : tabFilteredArticles
    );

    let finalArticles = processedArticles;
    if (
      ['favorites', 'published-today', 'readLater', 'history'].includes(viewForFiltering.type) &&
      activeTagFilter
    ) {
      finalArticles = processedArticles.filter(article => article.tags?.includes(activeTagFilter));
    }

    const availableTags = new Set<string>();
    processedArticles.forEach(a => a.tags?.forEach(t => availableTags.add(t)));
    const sortedTags = Array.from(availableTags).sort();

    return { articlesToShow: finalArticles, availableTagsForFilter: sortedTags };
  }, [
    currentView,
    feedsById,
    allArticles,
    readLaterArticleIds,
    readArticleIds,
    articlesById,
    favoriteFeeds,
    activeTagFilter,
    readLaterOrderYt,
    readLaterOrderRss,
    tagOrders,
    favoritesOrderYt,
    favoritesOrderRss,
    sidebarTab,
    aiHierarchy,
    ytAiHierarchy,
    nonYtAiHierarchy,
  ]);

  const notesForView = useMemo(() => {
    if (currentView.type !== 'note-folder') return [];
    const folderId = currentView.value;
    return notes
      .filter(note => note.folderId === folderId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [currentView, notes]);

  const unreadVisibleCount = useMemo(
    () => articlesToShow.filter(a => !readArticleIds.has(a.id)).length,
    [articlesToShow, readArticleIds]
  );
  const headerTitle = useMemo(() => {
    switch (currentView.type) {
      case 'feed':
        return feedsById.get(currentView.value || '')?.title || 'Feed';
      case 'search':
        return `Search: "${currentView.value}"`;
      case 'keyword-articles':
        return `Keyword: "${currentView.value}"`;
      case 'readLater':
        return 'Read Later';
      case 'history':
        return 'History';
      case 'favorites':
        return 'Favorites';
      case 'tag': {
        const tagValue = currentView.value;
        const tagName = typeof tagValue === 'object' && tagValue.name ? tagValue.name : tagValue;
        return `#${tagName}`;
      }
      case 'note-folder': {
        const folder = noteFolders.find(f => f.id === currentView.value);
        return folder ? folder.name : 'Notes';
      }
      case 'published-today':
        return 'Published Today';
      case 'ai-summary-yt':
        return 'YT with AI Summary';
      case 'ai-topic':
        return (currentView.value as { title: string }).title || 'AI Topic';
      case 'all-subscriptions':
        return 'All Subscriptions';
      case 'inactive-feeds':
        return 'Inactive Feeds';
      case 'feed-health':
        return 'Feed Health Dashboard';
      case 'dump':
        return 'URL Dump';
      case 'privacy-policy':
        return 'Privacy Policy';
      case 'about':
        return 'About Media-Feeder';
      case 'help':
        return 'Help & Guide';
      default:
        return 'Media-Feeder';
    }
  }, [currentView, feedsById, noteFolders]);
  const emptyMessage = useMemo(() => {
    if (isViewLoading) return 'Loading...';
    if (activeTagFilter) return `No articles match the tag "${activeTagFilter}".`;
    switch (currentView.type) {
      case 'feed':
        return 'No articles in this feed.';
      case 'search':
        return 'No articles found for your search.';
      case 'keyword-articles':
        return 'No articles found for this keyword.';
      case 'readLater':
        return 'You have no articles saved for later.';
      case 'history':
        return 'Your reading history is empty.';
      case 'favorites':
        return 'No articles in your favorite feeds.';
      case 'tag':
        return 'No articles found for this tag.';
      case 'note-folder':
        return 'This folder is empty. Save summaries from articles to create notes.';
      case 'published-today':
        return 'No articles published today.';
      case 'ai-summary-yt':
        return 'No YouTube articles with an AI summary found.';
      case 'ai-topic':
        return 'No articles found for this AI topic.';
      default:
        return 'No articles to display.';
    }
  }, [currentView, isViewLoading, activeTagFilter]);

  const canZoomIn = useMemo(() => ZOOM_LEVELS.indexOf(gridZoomLevel) > 0, [gridZoomLevel]);
  const canZoomOut = useMemo(
    () => ZOOM_LEVELS.indexOf(gridZoomLevel) < ZOOM_LEVELS.length - 1,
    [gridZoomLevel]
  );
  const canArticleZoomIn = useMemo(
    () => ZOOM_LEVELS.indexOf(articleZoomLevel) > 0,
    [articleZoomLevel]
  );
  const canArticleZoomOut = useMemo(
    () => ZOOM_LEVELS.indexOf(articleZoomLevel) < ZOOM_LEVELS.length - 1,
    [articleZoomLevel]
  );

  const handleViewChange = useCallback(
    (type: string, value?: any) => {
      if (isProcessingUrl) return;
      let newHash = `#/${type}`;
      if (value) {
        if (type === 'tag' && typeof value === 'object' && value.name && value.type) {
          newHash += `/${value.type}/${encodeURIComponent(value.name)}`;
        } else if (type === 'ai-topic' && typeof value === 'object' && value.title) {
          newHash += `/${encodeURIComponent(value.title)}`;
        } else if (typeof value === 'string') {
          newHash += `/${encodeURIComponent(value)}`;
        }
      }
      if (window.location.hash !== newHash) {
        window.location.hash = newHash;
      }
    },
    [isProcessingUrl]
  );

  const handleSummaryGenerated = useCallback(
    (articleId: string, summary: string | StructuredVideoSummary, sources?: WebSource[]) => {
      const updateArticle = (article: Article) => {
        if (typeof summary === 'string') {
          return { ...article, summary, sources: sources || [] };
        }
        return { ...article, structuredSummary: summary, sources: sources || [] };
      };

      setFeeds(prevFeeds =>
        prevFeeds.map(feed => ({
          ...feed,
          items: feed.items.map(item => (item.id === articleId ? updateArticle(item) : item)),
        }))
      );

      setSelectedArticle(prevArticle =>
        prevArticle?.id === articleId ? updateArticle(prevArticle) : prevArticle
      );
    },
    []
  );

  // FIX: Moved handleQuotaError before its usage in runInBackgroundSummaryGeneration
  const handleQuotaError = useCallback(
    (options?: { source: 'auto' | 'manual' }) => {
      setToast({
        message:
          "Gemini API quota exceeded. Please check your API key's billing status or try again later.",
        type: 'error',
      });
      if (options?.source === 'auto') {
        setAutoSummarizeOnRefresh(false);
        setIsAiDisabled(true);
      }
    },
    [setToast, setAutoSummarizeOnRefresh, setIsAiDisabled]
  );

  const handleToggleAutoTranscribeOnRefresh = useCallback(() => {
    setAutoTranscribeOnRefresh(prev => !prev);
  }, []);

  const runInBackgroundTranscription = useCallback(
    async (feedsToProcess: Feed[]) => {
      console.log('[AutoTranscript] Checking if auto-transcription is valid...', {
        autoTranscribeOnRefresh,
      });
      if (!autoTranscribeOnRefresh) {
        console.log('[AutoTranscript] Skipped: disabled.');
        return;
      }

      const allArticles = feedsToProcess.flatMap(f => f.items);

      // Filter by time window
      const timeWindowMs = autoAiTimeWindowDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - timeWindowMs;

      const videosToTranscribe = allArticles
        .filter(a => a.isVideo && getYouTubeId(a.link) && !a.transcript && !a.transcriptAttempted)
        .filter(a => a.pubDateTimestamp && a.pubDateTimestamp >= cutoffTime)
        .sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));

      console.log(
        `[AutoTranscript] Found ${videosToTranscribe.length} videos eligible for transcription (filtered by last ${autoAiTimeWindowDays} days).`
      );

      if (videosToTranscribe.length === 0) return;

      const updates = new Map<string, any>();
      const attemptedIds = new Set<string>();

      // Process sequentially to avoid rate limits/blocking
      for (const article of videosToTranscribe) {
        attemptedIds.add(article.id);
        try {
          console.log(`[AutoTranscript] Fetching transcript for: ${article.title}`);
          const videoId = getYouTubeId(article.link)!;
          const choices = await fetchAvailableCaptionChoices(videoId);
          if (choices.length > 0) {
            const lines = await fetchAndParseTranscript(choices[0].url);
            if (lines.length > 0) {
              console.log(`[AutoTranscript] Success for: ${article.title}`);
              updates.set(article.id, lines);
              article.transcript = lines; // Update local reference in-place
            }
          } else {
            console.log(`[AutoTranscript] No captions found for: ${article.title}`);
          }
        } catch (e) {
          console.warn(`[AutoTranscript] Failed for ${article.title}`, e);
        }
      }

      // Update feeds with transcripts and mark all as attempted
      if (updates.size > 0 || attemptedIds.size > 0) {
        console.log(
          `[AutoTranscript] Updating ${updates.size} articles with transcripts, marking ${attemptedIds.size} as attempted.`
        );
        setFeeds(currentFeeds =>
          currentFeeds.map(feed => ({
            ...feed,
            items: feed.items.map(item => {
              if (attemptedIds.has(item.id)) {
                return {
                  ...item,
                  transcript: updates.get(item.id) || item.transcript,
                  transcriptAttempted: true,
                };
              }
              return item;
            }),
          }))
        );
      }
    },
    [autoTranscribeOnRefresh]
  );

  const runInBackgroundSummaryGeneration = useCallback(
    async (allFeeds: Feed[]) => {
      console.log('[AutoSummary] Checking if auto-summary is valid...', { autoSummarizeOnRefresh });
      if (!autoSummarizeOnRefresh) {
        console.log('[AutoSummary] Skipped: disabled.');
        return;
      }

      const allArticles = allFeeds.flatMap(f => f.items);

      // Filter by time window
      const timeWindowMs = autoAiTimeWindowDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - timeWindowMs;

      const videosToSummarize = allArticles
        .filter(a => a.isVideo && !a.summary && !a.structuredSummary && getYouTubeId(a.link))
        .filter(a => a.pubDateTimestamp && a.pubDateTimestamp >= cutoffTime)
        .sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));

      console.log(
        `[AutoSummary] Found ${videosToSummarize.length} videos eligible for summary (filtered by last ${autoAiTimeWindowDays} days).`
      );

      if (videosToSummarize.length === 0) {
        return;
      }

      for (const article of videosToSummarize) {
        console.log(`[AutoSummary] Processing: ${article.title}`);
        const videoId = getYouTubeId(article.link)!;
        try {
          let transcriptLines = article.transcript;

          if (!transcriptLines || transcriptLines.length === 0) {
            const choices = await fetchAvailableCaptionChoices(videoId);
            if (choices.length > 0) {
              transcriptLines = await fetchAndParseTranscript(choices[0].url);
            }
          }

          if (transcriptLines && transcriptLines.length > 3) {
            const { summary, sources } = await summarizeYouTubeVideo(
              article.title,
              transcriptLines,
              aiModel,
              defaultAiLanguage
            );
            handleSummaryGenerated(article.id, summary, sources);
            continue;
          }

          const textForSummary = `Title: ${article.title}\nDescription: ${(article.content || article.description).replace(/<[^>]*>?/gm, '').trim()}`;
          if (textForSummary.length > 100) {
            const { summary, sources } = await summarizeText(
              textForSummary,
              article.link,
              aiModel,
              defaultAiLanguage,
              'video'
            );
            handleSummaryGenerated(article.id, summary, sources);
          }
        } catch (error) {
          console.warn(`[AutoSummary] Auto-summary failed for "${article.title}":`, error);
          if (error instanceof QuotaExceededError) {
            handleQuotaError({ source: 'auto' });
            break;
          }
        }
      }
    },
    [aiModel, defaultAiLanguage, handleSummaryGenerated, autoSummarizeOnRefresh, handleQuotaError]
  );

  const runInBackgroundGrouping = useCallback(
    async (feedsOverride?: Feed[]) => {
      console.log('[AutoGrouping] Checking if auto-grouping is valid...', {
        autoClusterOnRefresh,
        isRefreshing: isRefreshingRef.current,
      });
      console.log('[AutoGrouping] Called from:', new Error().stack?.split('\n')[2]?.trim());
      if (!autoClusterOnRefresh) {
        console.log('[AutoGrouping] Skipped: disabled.');
        return;
      }
      if (isRefreshingRef.current) {
        console.log('[AutoGrouping] Skipped: refresh in progress.');
        return;
      }
      const feedsToUse = feedsOverride || feeds;

      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const allArticles = feedsToUse.flatMap(f => f.items);
      console.log(`[AutoGrouping] Total articles in feeds: ${allArticles.length}`);

      // Deduplicate by ID
      const seenIds = new Set<string>();
      const uniqueArticles: Article[] = [];
      for (const article of allArticles) {
        if (!seenIds.has(article.id)) {
          seenIds.add(article.id);
          uniqueArticles.push(article);
        }
      }
      console.log(`[AutoGrouping] Unique articles: ${uniqueArticles.length}`);

      const recentArticles = uniqueArticles
        .filter(i => {
          const isRecent = i.pubDateTimestamp && i.pubDateTimestamp >= threeDaysAgo;
          return isRecent;
        })
        .sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0))
        .slice(0, 250);

      console.log(`[AutoGrouping] Processing ${recentArticles.length} recent articles.`);
      if (recentArticles.length > 0) {
        console.log('[AutoGrouping] Top 3 most recent articles for AI:');
        recentArticles.slice(0, 3).forEach((a, i) => {
          console.log(
            `  ${i + 1}. "${a.title}" - ${new Date(a.pubDateTimestamp || 0).toLocaleString()}`
          );
        });
      }

      if (recentArticles.length < 5) {
        console.log(
          '[AutoGrouping] Not enough recent articles to generate a meaningful hierarchy.'
        );
        return;
      }

      try {
        console.log('[AutoGrouping] Generating hierarchy...');
        const hierarchy = await generateMindmapHierarchy(
          recentArticles,
          aiModel,
          'Recent Articles',
          defaultAiLanguage,
          personalInterests
        );
        console.log('[AutoGrouping] Hierarchy generated successfully.');
        setAiHierarchy(hierarchy);
        // Clear tab-specific hierarchies to ensure the new auto-hierarchy is shown in the sidebar
        setYtAiHierarchy(null);
        setNonYtAiHierarchy(null);
      } catch (error) {
        console.warn('[AutoGrouping] Failed to generate background hierarchy:', error);
        if (error instanceof QuotaExceededError) {
          handleQuotaError({ source: 'auto' });
          // Disable auto-cluster to prevent further errors
          setAutoClusterOnRefresh(false);
        }
      }
    },
    [autoClusterOnRefresh, feeds, aiModel, defaultAiLanguage, personalInterests, handleQuotaError]
  );

  // Re-cluster when personal interests change
  useEffect(() => {
    if (personalInterests.length > 0 && autoClusterOnRefresh) {
      console.log('[AutoGrouping] Personal interests changed, triggering re-grouping...');
      runInBackgroundGrouping();
    }
  }, [personalInterests, autoClusterOnRefresh, runInBackgroundGrouping]);

  const handleImportData = useCallback(
    (data: SyncData, options?: { silent?: boolean }) => {
      try {
        if (!data || !Array.isArray(data.feeds)) {
          throw new Error("Data is missing 'feeds' array or is not in the correct format.");
        }

        setReadArticleIds(new Map());
        setReadLaterArticleIds(new Set());
        setLikedVideoIds(new Set());
        setArticleTags(new Map());
        setReadLaterOrderYt([]);
        setReadLaterOrderRss([]);
        setTagOrders({});
        setFavoritesOrderYt([]);
        setFavoritesOrderRss([]);
        setNotes([]);
        setNoteFolders([]);
        setHighlights([]);

        let newFeedsCount = 0;
        const allImportedArticles: Article[] = [];
        const currentFeedsMap = new Map(feeds.map(f => [f.url, f]));

        currentFeedsMap.forEach((feed: Feed) => {
          feed.items = [];
        });

        data.feeds.forEach((importedFeed: Omit<Feed, 'id' | 'items' | 'error'>) => {
          const existingFeed = currentFeedsMap.get(importedFeed.url);
          const feedId = existingFeed ? existingFeed.id : importedFeed.url;
          const isYouTubeFeed = importedFeed.url.toLowerCase().includes('youtube.com');

          const articlesFromBackup = (data.articlesByFeedUrl?.[importedFeed.url] || []).map(
            (art: Article) => {
              const content =
                isYouTubeFeed && art.description ? art.description : (art.content ?? '');
              return {
                ...art,
                content: content,
                feedId: art.feedId || feedId,
              };
            }
          );
          allImportedArticles.push(...articlesFromBackup);

          if (existingFeed) {
            const updatedFeed: Feed = {
              ...existingFeed,
              ...importedFeed,
              items: articlesFromBackup,
              error: null,
            };
            currentFeedsMap.set(updatedFeed.url, updatedFeed);
          } else {
            const newFeed: Feed = {
              ...importedFeed,
              id: feedId,
              items: articlesFromBackup,
              error: null,
            };
            currentFeedsMap.set(newFeed.url, newFeed);
            newFeedsCount++;
          }
        });

        if (data.readLaterArticleIds) setReadLaterArticleIds(new Set(data.readLaterArticleIds));
        if (data.readLaterOrderYt) setReadLaterOrderYt(data.readLaterOrderYt);
        if (data.readLaterOrderRss) setReadLaterOrderRss(data.readLaterOrderRss);
        if (data.readArticleIds) setReadArticleIds(new Map(data.readArticleIds));
        if (data.likedVideoIds) setLikedVideoIds(new Set(data.likedVideoIds));
        if (data.articleTags) setArticleTags(new Map(data.articleTags));
        if (data.tagOrders) setTagOrders(data.tagOrders);
        if (data.favoritesOrderYt) setFavoritesOrderYt(data.favoritesOrderYt);
        if (data.favoritesOrderRss) setFavoritesOrderRss(data.favoritesOrderRss);
        if (data.notes) setNotes(data.notes);
        if (data.noteFolders) setNoteFolders(data.noteFolders);
        if (data.highlights) setHighlights(data.highlights);

        if (data.gridZoomLevel) setGridZoomLevel(data.gridZoomLevel);
        if (data.articleZoomLevel) setArticleZoomLevel(data.articleZoomLevel);
        if (data.autoplayMode) setAutoplayMode(data.autoplayMode);

        const latestFeeds = Array.from(currentFeedsMap.values());
        feedsRef.current = latestFeeds;
        setFeeds(latestFeeds);

        runInBackgroundTranscription(latestFeeds).then(() => {
          runInBackgroundSummaryGeneration(latestFeeds).then(() => {
            runInBackgroundGrouping(latestFeeds);
          });
        });

        const totalImportedFeeds = currentFeedsMap.size;
        if (!options?.silent) {
          setToast({
            message: `Import successful! ${totalImportedFeeds} feeds and their articles have been loaded.`,
            type: 'success',
          });
        }

        if (currentView.type === 'import') {
          handleViewChange('all-subscriptions');
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'An unknown error occurred during import.';
        if (!options?.silent) {
          setToast({ message: `Import failed: ${message}`, type: 'error' });
        }
        throw e;
      }
    },
    [
      feeds,
      setFeeds,
      setReadArticleIds,
      setReadLaterArticleIds,
      setLikedVideoIds,
      setArticleTags,
      setReadLaterOrderYt,
      setReadLaterOrderRss,
      setTagOrders,
      setFavoritesOrderYt,
      setFavoritesOrderRss,
      setGridZoomLevel,
      setArticleZoomLevel,
      setAutoplayMode,
      setToast,
      currentView,
      handleViewChange,
      setNotes,
      setNoteFolders,
      runInBackgroundTranscription,
      runInBackgroundSummaryGeneration,
      runInBackgroundGrouping,
      autoAiTimeWindowDays,
    ]
  );

  const handleCancelAddVideoOrChannel = useCallback(() => {
    setVideoToAdd(null);
  }, []);

  const handleSelectFeed = useCallback(
    (feedId: string) => {
      handleViewChange('feed', feedId);
    },
    [handleViewChange]
  );

  const handleOpenArticle = useCallback((article: Article) => {
    setReadArticleIds(prev => {
      if (prev.has(article.id)) {
        return prev;
      }
      const newMap = new Map(prev);
      newMap.set(article.id, Date.now());
      return newMap;
    });

    const newHash = `#/article/${encodeURIComponent(article.feedId)}/${encodeURIComponent(article.id)}`;
    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  }, []);

  const readLaterArticleIdsRef = useRef(readLaterArticleIds);
  useEffect(() => {
    readLaterArticleIdsRef.current = readLaterArticleIds;
  }, [readLaterArticleIds]);

  const safeSetLocalStorage = useCallback(
    (key: string, value: any) => {
      const stringify = (v: any) =>
        JSON.stringify(v, (_, val) => {
          if (val instanceof Set) return Array.from(val);
          if (val instanceof Map) return Array.from(val.entries());
          return val;
        });

      try {
        localStorage.setItem(key, stringify(value));
      } catch (e: any) {
        const isQuotaError =
          e.name === 'QuotaExceededError' || (e.code && (e.code === 22 || e.code === 1014));
        if (!isQuotaError) {
          console.error(`An unexpected error occurred with localStorage for key "${key}":`, e);
          throw e;
        }

        localStorage.removeItem(ARTICLES_CACHE_KEY);

        try {
          localStorage.setItem(key, stringify(value));
          return;
        } catch (retryError: any) {
          const isStillQuotaError =
            retryError.name === 'QuotaExceededError' ||
            (retryError.code && (retryError.code === 22 || retryError.code === 1014));
          if (!isStillQuotaError || key !== FEEDS_STORAGE_KEY) {
            return;
          }

          const feedsToPrune: Feed[] = value;
          const articlesToConsiderForPruning = feedsToPrune
            .flatMap(feed => feed.items)
            .filter(article => !readLaterArticleIdsRef.current.has(article.id));

          if (articlesToConsiderForPruning.length === 0) {
            return;
          }

          articlesToConsiderForPruning.sort(
            (a, b) => (a.pubDateTimestamp || Infinity) - (b.pubDateTimestamp || Infinity)
          );

          const articlesToRemoveCount = Math.ceil(articlesToConsiderForPruning.length * 0.25);
          const articlesToRemoveIds = new Set(
            articlesToConsiderForPruning.slice(0, articlesToRemoveCount).map(a => a.id)
          );

          const prunedFeeds = feedsToPrune.map(feed => ({
            ...feed,
            items: feed.items.filter(item => !articlesToRemoveIds.has(item.id)),
          }));

          setFeeds(prunedFeeds);
        }
      }
    },
    [setFeeds]
  );

  const handleProxyAttempt = useCallback(
    (proxyName: string, status: 'success' | 'failure', feedType: FeedType) => {
      setProxyStats((prev: ProxyStats) => {
        const newStats = JSON.parse(JSON.stringify(prev));
        if (!newStats[proxyName]) {
          newStats[proxyName] = {
            youtube: { success: 0, failure: 0 },
            rss: { success: 0, failure: 0 },
          };
        }
        if (!newStats[proxyName][feedType]) {
          newStats[proxyName][feedType] = { success: 0, failure: 0 };
        }
        newStats[proxyName][feedType][status]++;
        return newStats;
      });
    },
    []
  );

  const readArticleIdsRef = useRef(readArticleIds);
  useEffect(() => {
    readArticleIdsRef.current = readArticleIds;
  }, [readArticleIds]);

  const updateArticlesCache = useCallback(
    (updatedFeeds: Feed[]) => {
      try {
        const cache = getStoredData<Record<string, Article[]>>(ARTICLES_CACHE_KEY, {});
        updatedFeeds.forEach(feed => {
          if (feed.isPlaylist) {
            const sortedItems = [...feed.items]
              .sort(
                (a: Article, b: Article) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0)
              )
              .slice(0, ARTICLES_CACHE_LIMIT);
            cache[feed.id] = sortedItems;
          } else {
            const unreadItems = feed.items.filter(
              (item: Article) => !readArticleIdsRef.current.has(item.id)
            );
            const sortedAndLimitedItems = unreadItems
              .sort(
                (a: Article, b: Article) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0)
              )
              .slice(0, ARTICLES_CACHE_LIMIT);
            cache[feed.id] = sortedAndLimitedItems;
          }
        });
        safeSetLocalStorage(ARTICLES_CACHE_KEY, cache);
      } catch (e) {
        console.error('Failed to save articles cache to localStorage:', e);
      }
    },
    [safeSetLocalStorage]
  );

  const handleConfirmAddChannel = useCallback(
    async (channelUrl: string, channelTitle: string) => {
      setVideoToAdd(null);
      setAddFeedModalOpen(true);
      try {
        const newFeed = await fetchAndParseRss(
          channelUrl,
          channelTitle,
          handleProxyAttempt,
          disabledProxies,
          proxyStats,
          500
        );
        const isDuplicate = feeds.some(f => f.id === newFeed.id);
        if (isDuplicate) {
          setToast({ message: 'This channel is already in your subscriptions.', type: 'error' });
          return;
        }
        const feedToAdd: Feed = { ...newFeed, error: null };
        setFeeds(prevFeeds => [...prevFeeds, feedToAdd]);
        updateArticlesCache([feedToAdd]);
        handleSelectFeed(feedToAdd.id);
        setToast({ message: `Added "${feedToAdd.title}".`, type: 'success' });
        setFeedToEditTags(feedToAdd);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to add channel.';
        setToast({ message, type: 'error' });
      } finally {
        setAddFeedModalOpen(false);
      }
    },
    [
      feeds,
      handleProxyAttempt,
      disabledProxies,
      proxyStats,
      updateArticlesCache,
      handleSelectFeed,
      setToast,
      setFeedToEditTags,
    ]
  );

  const handleConfirmAddSingleVideo = useCallback(
    async (videoArticle: Article) => {
      setVideoToAdd(null);
      try {
        const existingFeed = feeds.find(f => f.id === videoArticle.feedId);
        if (existingFeed) {
          const articleExists = existingFeed.items.some(item => item.id === videoArticle.id);
          if (articleExists) {
            setToast({
              message: 'This video is already in your feed for this channel.',
              type: 'error',
            });
            return;
          }
          setFeeds(currentFeeds =>
            currentFeeds.map(f => {
              if (f.id === videoArticle.feedId) {
                const updatedItems = [videoArticle, ...f.items].sort(
                  (a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0)
                );
                return { ...f, items: updatedItems };
              }
              return f;
            })
          );
          setToast({
            message: `Added "${videoArticle.title}" to "${videoArticle.feedTitle}".`,
            type: 'success',
          });
        } else {
          const newFeed: Feed = {
            id: videoArticle.feedId,
            url: videoArticle.feedId,
            title: videoArticle.feedTitle,
            items: [videoArticle],
            error: null,
            iconUrl: videoArticle.imageUrl,
          };
          setFeeds(prevFeeds => [...prevFeeds, newFeed]);
          updateArticlesCache([newFeed]);
          handleSelectFeed(newFeed.id);
          setToast({
            message: `Added "${videoArticle.title}" and created a feed for "${newFeed.title}".`,
            type: 'success',
          });
        }

        setArticleTags(prev => {
          const newMap = new Map(prev);
          const existingTags = newMap.get(videoArticle.id) || [];
          const newTags = Array.from(new Set([...existingTags, 'Videos'])).sort();
          newMap.set(videoArticle.id, newTags);
          return newMap;
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to add video.';
        setToast({ message, type: 'error' });
      }
    },
    [feeds, updateArticlesCache, handleSelectFeed, setToast, setArticleTags]
  );

  const addRecentShareCode = useCallback((code: string) => {
    setRecentShareCodes(prevCodes => {
      const filteredCodes = prevCodes.filter(c => c !== code);
      const newCodes = [code, ...filteredCodes];
      return newCodes.slice(0, 3);
    });
  }, []);

  const handleShareToCloudLink = useCallback(
    async (options?: { tag?: string }): Promise<{ fullUrl: string; shortCode: string }> => {
      let feedsToExportSource: Feed[];
      if (options?.tag) {
        feedsToExportSource = feedsByTag.get(options.tag) || [];
      } else {
        feedsToExportSource = feeds;
      }

      const articlesByFeedUrl: Record<string, Article[]> = {};
      const feedsToExport = feedsToExportSource.map(feed => {
        const { id, items, error, ...rest } = feed;
        const articlesToKeep = items.map(item => {
          const { sources, ...restItem } = item;
          return restItem;
        });
        articlesByFeedUrl[feed.url] = articlesToKeep as Article[];
        return rest;
      });

      const dataToExport: SyncData = {
        feeds: feedsToExport,
        articlesByFeedUrl,
        readLaterArticleIds: Array.from(readLaterArticleIds),
        gridZoomLevel,
        articleZoomLevel,
        autoplayMode,
        articleTags: Array.from(articleTags.entries()),
        readLaterOrderYt,
        readLaterOrderRss,
        tagOrders,
        favoritesOrderYt,
        favoritesOrderRss,
        notes,
        noteFolders,
        highlights,
      };
      const jsonString = JSON.stringify(dataToExport);
      const compressedData = LZString.compressToBase64(jsonString);
      const compressed = `media-feeder-compressed:v2:${compressedData}`;

      const uploadChunk = async (
        chunk: string,
        title: string,
        forceService?: 'dpaste' | 'pastegg'
      ): Promise<{ service: 'dpaste' | 'pastegg'; id: string }> => {
        const allServices = [
          {
            name: 'dpaste' as const,
            upload: async (proxy: (typeof PROXIES)[0]) => {
              const apiUrl = 'https://dpaste.org/api/';
              const proxyUrl = proxy.buildUrl(apiUrl);
              const body = new URLSearchParams({
                content: chunk,
                title: title,
                syntax: 'text',
                expiry_days: '1',
              });
              const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
              });
              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                  `Service dpaste.org via ${proxy.name} responded with status ${response.status}: ${errorText}`
                );
              }
              const shareUrl = (await response.text()).trim().replace(/^"|"$/g, '');
              const id = shareUrl.split('/').pop();
              if (!id) throw new Error('dpaste.org did not return a valid URL.');
              return { service: 'dpaste' as const, id };
            },
          },
          {
            name: 'pastegg' as const,
            upload: async (proxy: (typeof PROXIES)[0]) => {
              const apiUrl = 'https://api.paste.gg/v1/pastes';
              const proxyUrl = proxy.buildUrl(apiUrl);
              const expiryDate = new Date();
              expiryDate.setDate(expiryDate.getDate() + 1);
              const body = JSON.stringify({
                expires: expiryDate.toISOString(),
                files: [
                  { name: 'media-feeder-backup.txt', content: { format: 'text', value: chunk } },
                ],
              });
              const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
              });
              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                  `Service paste.gg via ${proxy.name} responded with status ${response.status}: ${errorText}`
                );
              }
              const result = await response.json();
              const id = result?.result?.id;
              if (!id) throw new Error('paste.gg did not return a valid ID.');
              return { service: 'pastegg' as const, id };
            },
          },
        ];

        const servicesToTry = forceService
          ? allServices.filter(s => s.name === forceService)
          : allServices;
        if (forceService && servicesToTry.length === 0) {
          throw new Error(`Forced service "${forceService}" is not available.`);
        }

        let lastError: Error | null = null;
        for (const service of servicesToTry) {
          for (const proxy of PROXIES) {
            try {
              return await service.upload(proxy);
            } catch (e) {
              lastError = e instanceof Error ? e : new Error(String(e));
              console.warn(
                `Sharing with ${service.name} via ${proxy.name} failed:`,
                lastError.message
              );
            }
          }
        }
        throw lastError || new Error('All sharing services and proxies failed.');
      };

      const CHUNK_SIZE_LIMIT = 2.8 * 1024 * 1024;
      const DPASTE_SIZE_LIMIT = 250 * 1024;

      if (compressed.length <= CHUNK_SIZE_LIMIT) {
        try {
          const isLargeForDpaste = compressed.length > DPASTE_SIZE_LIMIT;
          if (isLargeForDpaste) {
            setToast({
              message: 'Backup is large, using high-capacity share service...',
              type: 'success',
            });
          }
          const result = await uploadChunk(
            compressed,
            `Media-Feeder Backup ${new Date().toISOString()}`,
            isLargeForDpaste ? 'pastegg' : undefined
          );

          let shortCode: string;
          if (result.service === 'pastegg') {
            const compressedId = hexToBase64(result.id);
            shortCode = `p:${compressedId}`;
          } else {
            shortCode = `d/${result.id}`;
          }
          const fullUrl = `${window.location.origin}${window.location.pathname}#/import=${encodeURIComponent(shortCode)}`;
          addRecentShareCode(shortCode);
          return { fullUrl, shortCode };
        } catch (e) {
          const message = e instanceof Error ? e.message : 'An unknown error occurred.';
          throw new Error(`Cloud sharing failed: ${message}`);
        }
      }

      setToast({ message: 'Backup is large, generating multiple links...', type: 'success' });
      const shareId = Math.random().toString(36).substring(2, 10);
      const totalChunks = Math.ceil(compressed.length / CHUNK_SIZE_LIMIT);
      const chunks: string[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunkData = compressed.substring(i * CHUNK_SIZE_LIMIT, (i + 1) * CHUNK_SIZE_LIMIT);
        chunks.push(`media-feeder-multipart:v1:${i + 1}:${totalChunks}:${shareId}:${chunkData}`);
      }

      try {
        setToast({ message: `Uploading part 1 of ${totalChunks}...`, type: 'success' });

        const isFirstChunkLargeForDpaste = chunks[0].length > DPASTE_SIZE_LIMIT;
        const firstChunkResult = await uploadChunk(
          chunks[0],
          `Media-Feeder Multipart Backup ${shareId} (1/${totalChunks})`,
          isFirstChunkLargeForDpaste ? 'pastegg' : undefined
        );
        const chosenService = firstChunkResult.service;

        const remainingChunks = chunks.slice(1);
        const remainingPastePromises = remainingChunks.map(async (chunk, index) => {
          setToast({
            message: `Uploading part ${index + 2} of ${totalChunks}...`,
            type: 'success',
          });
          return await uploadChunk(
            chunk,
            `Media-Feeder Multipart Backup ${shareId} (${index + 2}/${totalChunks})`,
            chosenService
          );
        });

        const remainingPasteResults = await Promise.all(remainingPastePromises);
        const allPasteResults = [firstChunkResult, ...remainingPasteResults];

        if (allPasteResults.some(r => r.service !== chosenService)) {
          throw new Error(
            'Multipart upload failed: chunks were uploaded to different services. Please try again.'
          );
        }

        const pasteIds = allPasteResults.map(r => r.id);
        let shortCode: string;
        if (chosenService === 'pastegg') {
          const compressedIds = pasteIds.map(hexToBase64);
          shortCode = `mp:${compressedIds.join(',')}`;
        } else {
          shortCode = `md:${pasteIds.join(',')}`;
        }

        const fullUrl = `${window.location.origin}${window.location.pathname}#/import=${encodeURIComponent(shortCode)}`;
        addRecentShareCode(shortCode);
        return { fullUrl, shortCode };
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'An unknown error occurred during multipart upload.';
        throw new Error(`Cloud sharing failed: ${message}`);
      }
    },
    [
      feeds,
      gridZoomLevel,
      articleZoomLevel,
      autoplayMode,
      articleTags,
      feedsByTag,
      readLaterOrderYt,
      readLaterOrderRss,
      tagOrders,
      favoritesOrderYt,
      favoritesOrderRss,
      addRecentShareCode,
      readLaterArticleIds,
      setToast,
      notes,
      noteFolders,
    ]
  );

  const handleAddFeed = useCallback(
    async (
      rawUrl: string,
      options?: { headless?: boolean; silent?: boolean }
    ): Promise<Feed | void> => {
      setIsProcessingUrl(true);
      try {
        let url = rawUrl.trim();

        const handleSharedDataImport = async (content: string) => {
          let importedData: SyncData;
          if (content.startsWith('media-feeder-compressed:v2:')) {
            const compressedData = content.substring('media-feeder-compressed:v2:'.length);
            const decompressed = LZString.decompressFromBase64(compressedData);
            if (decompressed) {
              importedData = JSON.parse(decompressed) as SyncData;
            } else {
              throw new Error('Failed to decompress data from the link.');
            }
          } else {
            throw new Error(
              'This share link uses an old, unsupported compression format. Please generate a new link.'
            );
          }
          handleImportData(importedData, { silent: options?.silent });
          if (!options?.silent) {
            setToast({
              message: 'Successfully imported data from share link/code.',
              type: 'success',
            });
          }
        };

        const multiPartRegex = /(?:multi\/(pastegg|dpaste)|(mp|md)):([\w,-_]+)$/;
        const multiPartMatch = url.match(multiPartRegex);
        const serviceCodeRegex = /(?:(pastegg|dpaste)|(p|d))(?::|\/)([\w,-_]+)$/;
        const serviceCodeMatch = !multiPartMatch ? url.match(serviceCodeRegex) : null;

        if (multiPartMatch) {
          try {
            const serviceName =
              multiPartMatch[1] || (multiPartMatch[2] === 'mp' ? 'pastegg' : 'dpaste');
            const isCompressed = serviceName === 'pastegg';
            const rawIds = multiPartMatch[3].split(',');
            const ids = isCompressed ? rawIds.map(base64ToHex) : rawIds;
            if (!options?.silent) {
              setToast({ message: `Importing ${ids.length}-part backup...`, type: 'success' });
            }

            const fetchPromises = ids.map(async id => {
              if (serviceName === 'dpaste') {
                const rawContentUrl = `https://dpaste.org/${id}/raw`;
                const { content } = await fetchViaProxy(rawContentUrl, 'rss');
                return content;
              } else if (serviceName === 'pastegg') {
                const metadataUrl = `https://api.paste.gg/v1/pastes/${id}`;
                const { content: metadataContent } = await fetchViaProxy(metadataUrl, 'rss');
                const metadata = JSON.parse(metadataContent);
                if (metadata.status !== 'success')
                  throw new Error(
                    `Could not find paste.gg metadata for chunk: ${id}. It may have expired.`
                  );
                const fileId = metadata?.result?.files?.[0]?.id;
                if (!fileId) throw new Error(`Could not find a file ID for paste.gg chunk: ${id}.`);
                const fileContentUrl = `https://api.paste.gg/v1/pastes/${id}/files/${fileId}`;
                const { content: fileContentResponse } = await fetchViaProxy(fileContentUrl, 'rss');
                const fileData = JSON.parse(fileContentResponse);
                const content = fileData?.result?.content?.value;
                if (typeof content !== 'string')
                  throw new Error(`Could not extract content from the paste.gg file data.`);
                return content;
              } else {
                throw new Error(`Unsupported multipart service: ${serviceName}`);
              }
            });

            const chunkContents = await Promise.all(fetchPromises);
            const chunks: Record<number, string> = {};
            let shareId: string | null = null;
            let totalChunks: number | null = null;

            for (const content of chunkContents) {
              const match = content.match(
                /^media-feeder-multipart:v1:(\d+):(\d+):(\w+):([\s\S]+)$/
              );
              if (!match) {
                throw new Error('One of the backup parts is malformed or invalid.');
              }
              const index = parseInt(match[1], 10);
              const total = parseInt(match[2], 10);
              const id = match[3];
              const data = match[4];
              if (shareId === null) shareId = id;
              if (totalChunks === null) totalChunks = total;
              if (shareId !== id || totalChunks !== total) {
                throw new Error(
                  'Mismatched backup parts. Ensure all parts are from the same share link.'
                );
              }
              chunks[index] = data;
            }
            if (Object.keys(chunks).length !== totalChunks) {
              throw new Error(
                `Missing backup parts. Expected ${totalChunks}, but found ${Object.keys(chunks).length}.`
              );
            }
            let fullCompressedContent = '';
            for (let i = 1; i <= totalChunks; i++) {
              fullCompressedContent += chunks[i];
            }
            await handleSharedDataImport(`media-feeder-compressed:v2:${fullCompressedContent}`);
            addRecentShareCode(multiPartMatch[0]);
            return;
          } catch (e) {
            const message = e instanceof Error ? e.message : 'An unknown error occurred.';
            throw new Error(`Multipart import failed: ${message}`);
          }
        } else if (serviceCodeMatch) {
          try {
            const service =
              serviceCodeMatch[1] || (serviceCodeMatch[2] === 'p' ? 'pastegg' : 'dpaste');
            const isCompressed = serviceCodeMatch[2] === 'p';
            const rawCode = serviceCodeMatch[3];
            const code = isCompressed ? base64ToHex(rawCode) : rawCode;
            let content: string | null = null;

            if (service === 'dpaste') {
              const rawContentUrl = `https://dpaste.org/${code}/raw`;
              const { content: fetchedContent } = await fetchViaProxy(rawContentUrl, 'rss');
              content = fetchedContent;
            } else if (service === 'pastegg') {
              const metadataUrl = `https://api.paste.gg/v1/pastes/${code}`;
              const { content: metadataContent } = await fetchViaProxy(metadataUrl, 'rss');
              const metadata = JSON.parse(metadataContent);
              if (metadata.status !== 'success')
                throw new Error(
                  `Could not find paste.gg metadata for the provided code. It may have expired.`
                );
              const fileId = metadata?.result?.files?.[0]?.id;
              if (!fileId) throw new Error(`Could not find a file ID for the paste.gg code.`);
              const fileContentUrl = `https://api.paste.gg/v1/pastes/${code}/files/${fileId}`;
              const { content: fileContentResponse } = await fetchViaProxy(fileContentUrl, 'rss');
              const fileData = JSON.parse(fileContentResponse);
              content = fileData?.result?.content?.value;
              if (typeof content !== 'string')
                throw new Error(`Could not extract content from the paste.gg file data.`);
            }

            if (content) {
              await handleSharedDataImport(content);
              addRecentShareCode(serviceCodeMatch[0]);
              return;
            } else {
              throw new Error('Could not fetch content for the provided code.');
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : 'An unknown error occurred.';
            throw new Error(`Import from share link/code failed: ${message}`);
          }
        }

        const isJson = url.startsWith('{') || url.startsWith('[');
        const looksLikeUrl = url.includes('.') || url.includes(':');
        const looksLikeSimpleCode = /^[a-zA-Z0-9]{4,}$/.test(url);

        if (isJson) {
          // JSON content is handled by the caller or specialized logic
        } else if (!looksLikeUrl && looksLikeSimpleCode) {
          try {
            const code = url;
            const servicesToTry = ['dpaste', 'pastegg'];
            let content: string | null = null;
            let lastError: Error | null = null;
            for (const s of servicesToTry) {
              try {
                if (s === 'dpaste') {
                  const rawContentUrl = `https://dpaste.org/${code}/raw`;
                  const { content: fetchedContent } = await fetchViaProxy(rawContentUrl, 'rss');
                  content = fetchedContent;
                } else if (s === 'pastegg') {
                  const metadataUrl = `https://api.paste.gg/v1/pastes/${code}`;
                  const { content: metadataContent } = await fetchViaProxy(metadataUrl, 'rss');
                  const metadata = JSON.parse(metadataContent);
                  if (metadata.status !== 'success')
                    throw new Error(
                      `Could not find paste.gg metadata for the provided code. It may have expired.`
                    );
                  const fileId = metadata?.result?.files?.[0]?.id;
                  if (!fileId) throw new Error(`Could not find a file ID for the paste.gg code.`);
                  const fileContentUrl = `https://api.paste.gg/v1/pastes/${code}/files/${fileId}`;
                  const { content: fileContentResponse } = await fetchViaProxy(
                    fileContentUrl,
                    'rss'
                  );
                  const fileData = JSON.parse(fileContentResponse);
                  content = fileData?.result?.content?.value;
                  if (typeof content !== 'string')
                    throw new Error(`Could not extract content from the paste.gg file data.`);
                }
                if (content) break;
              } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
              }
            }
            if (content) {
              await handleSharedDataImport(content);
              addRecentShareCode(code);
              return;
            } else {
              throw (
                lastError ||
                new Error('Could not fetch content from any share service for the provided code.')
              );
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : 'An unknown error occurred.';
            throw new Error(`Import from share link/code failed: ${message}`);
          }
        }

        if (url.includes('pastebin.com')) {
          try {
            const jsonContent = await fetchContentFromPastebinUrl(url);
            const importedData: any = JSON.parse(jsonContent);

            let feedsToImport: Omit<Feed, 'id' | 'items' | 'error'>[] = [];

            if (importedData && Array.isArray(importedData.feeds)) {
              feedsToImport = importedData.feeds as Omit<Feed, 'id' | 'items' | 'error'>[];
            } else if (Array.isArray(importedData)) {
              feedsToImport = importedData as Omit<Feed, 'id' | 'items' | 'error'>[];
            } else {
              throw new Error('Pasted content is not a valid backup or channel list format.');
            }

            const existingUrls = new Set(feeds.map(f => f.url));
            const newFeeds: Feed[] = feedsToImport
              .filter(feedData => !existingUrls.has(feedData.url))
              .map(feedData => ({
                ...feedData,
                id: feedData.url,
                items: [],
                error: null,
              }));

            if (newFeeds.length > 0) {
              setFeeds(prev => [...prev, ...newFeeds]);
              setToast({
                message: `Successfully imported ${newFeeds.length} new feeds from Pastebin.`,
                type: 'success',
              });
            } else {
              setToast({
                message: 'All channels from the Pastebin link are already subscribed.',
                type: 'success',
              });
            }
            return;
          } catch (e) {
            const message = e instanceof Error ? e.message : 'An unknown error occurred.';
            throw new Error(`Import from Pastebin failed: ${message}`);
          }
        }

        if (!url.startsWith('http://') && !url.startsWith('https')) {
          url = `https://${url}`;
        }

        const isYouTubeVideo =
          (url.includes('youtube.com/watch?v=') || url.includes('youtu.be/')) &&
          !url.includes('list=');

        if (isYouTubeVideo && !options?.headless) {
          try {
            const videoId = getYouTubeId(url);
            if (videoId) {
              const existingArticle = allArticles.find(a => a.id === videoId);
              if (existingArticle) {
                handleOpenArticle(existingArticle);
                setAddFeedModalOpen(false);
                if (urlFromExtension) {
                  setUrlFromExtension(null);
                }
                return;
              }
              const videoArticle = await fetchSingleYouTubeVideoAsArticle(videoId);
              setVideoToAdd(videoArticle);
              setAddFeedModalOpen(false);
              return;
            }
          } catch (e) {
            const message =
              e instanceof Error ? e.message : 'Could not process YouTube video link.';
            throw new Error(message);
          }
        }

        let newFeed: Feed | null = null;
        const isPlaylist =
          url.toLowerCase().includes('youtube.com') && new URL(url).searchParams.has('list');

        if (isPlaylist) {
          if (accessToken) {
            try {
              const playlistId = new URL(url).searchParams.get('list');
              if (!playlistId) throw new Error('Invalid YouTube playlist URL.');
              newFeed = await fetchPlaylistAsFeed(playlistId, accessToken);
            } catch (e: any) {
              if (e.isAuthError) {
                newFeed = null;
              } else {
                throw e;
              }
            }
          }
          if (!newFeed) {
            newFeed = await fetchAndParseRss(
              url,
              undefined,
              handleProxyAttempt,
              disabledProxies,
              proxyStats
            );
          }
        } else {
          newFeed = await fetchAndParseRss(
            url,
            undefined,
            handleProxyAttempt,
            disabledProxies,
            proxyStats
          );
        }

        if (!newFeed) {
          throw new Error(`Failed to fetch or parse feed from "${url}".`);
        }
        const isDuplicate = feeds.some(f => f.id === newFeed!.id);

        if (isDuplicate) {
          throw new Error('This feed is already in your subscriptions.');
        }

        const feedToAdd: Feed = { ...newFeed, error: null };

        setFeeds(prevFeeds => [...prevFeeds, feedToAdd]);
        updateArticlesCache([feedToAdd]);

        if (!options?.headless) {
          handleSelectFeed(feedToAdd.id);
          setToast({ message: `Added "${feedToAdd.title}". Now add some tags.`, type: 'success' });
          setFeedToEditTags(feedToAdd);
        }
        return feedToAdd;
      } finally {
        setIsProcessingUrl(false);
      }
    },
    [
      feeds,
      accessToken,
      handleProxyAttempt,
      disabledProxies,
      proxyStats,
      handleSelectFeed,
      updateArticlesCache,
      setToast,
      setFeedToEditTags,
      handleImportData,
      addRecentShareCode,
      setVideoToAdd,
      setAddFeedModalOpen,
      allArticles,
      handleOpenArticle,
      urlFromExtension,
      setUrlFromExtension,
    ]
  );

  const handleAddFromRecommendation = useCallback(
    async (url: string, title: string, inheritedTags: string[] = []) => {
      const newFeedData = await fetchAndParseRss(
        url,
        title,
        handleProxyAttempt,
        disabledProxies,
        proxyStats,
        500
      );

      const isDuplicate = feeds.some(f => f.id === newFeedData.id);

      if (isDuplicate) {
        throw new Error(`"${newFeedData.title}" is already in your subscriptions.`);
      }

      const feedToAdd: Feed = {
        ...newFeedData,
        tags: inheritedTags.length > 0 ? inheritedTags : undefined,
        error: null,
      };

      setFeeds(prevFeeds => [...prevFeeds, feedToAdd]);
      updateArticlesCache([feedToAdd]);

      setToast({ message: `Added "${feedToAdd.title}". Now add some tags.`, type: 'success' });
      setFeedToEditTags(feedToAdd);
    },
    [
      feeds,
      handleProxyAttempt,
      disabledProxies,
      proxyStats,
      setToast,
      updateArticlesCache,
      setFeedToEditTags,
    ]
  );

  const handleEnterApp = useCallback(() => {
    setHasEnteredApp(true);
  }, []);

  const handleSetSidebarTab = useCallback((tab: 'yt' | 'rss') => {
    setSidebarTab(tab);
  }, []);

  const handleSetSidebarFeedsView = useCallback((view: SidebarFeedsView) => {
    setSidebarFeedsView(view);
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      const trimmedQuery = query.trim();

      const isFullUrl = trimmedQuery.startsWith('http://') || trimmedQuery.startsWith('https');
      const isShareCode = /^(mp:|md:|p:|d\/|multi\/)/.test(trimmedQuery);
      const looksLikeUrl =
        !trimmedQuery.includes(' ') && trimmedQuery.includes('.') && trimmedQuery.includes('/');

      if (isFullUrl || isShareCode || looksLikeUrl) {
        handleAddFeed(trimmedQuery).catch(err => {
          console.error('Attempt to add from search bar failed:', err);
        });
      } else {
        handleViewChange('search', trimmedQuery);
      }
    },
    [handleAddFeed, handleViewChange]
  );

  useEffect(() => {
    const initialView = getInitialView();
    const shouldBypassHomepage =
      initialView.type === 'article' ||
      initialView.type === 'import' ||
      initialView.type === 'privacy-policy' ||
      initialView.type === 'about' ||
      initialView.type === 'add-feed-from-url';
    if (shouldBypassHomepage) {
      setHasEnteredApp(true);
    }
  }, []);

  const handleCloseArticleModal = useCallback(() => {
    setSelectedArticle(null);

    let newHash = `#/${backgroundView.type}`;
    if (backgroundView.value) {
      if (typeof backgroundView.value === 'string') {
        newHash += `/${encodeURIComponent(backgroundView.value)}`;
      } else if (
        typeof backgroundView.value === 'object' &&
        backgroundView.value.name &&
        backgroundView.value.type
      ) {
        newHash += `/${backgroundView.value.type}/${encodeURIComponent(backgroundView.value.name)}`;
      }
    }
    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  }, [backgroundView, setSelectedArticle]);

  const articlesForNavigation = useMemo(() => {
    const viewForFiltering = backgroundView;
    let rawArticles: Article[];
    let needsDeduplication = false;

    switch (viewForFiltering.type) {
      case 'feed': {
        const feedToDisplay = feedsById.get(viewForFiltering.value || '');
        if (feedToDisplay) {
          const articleIdsInFeed = new Set(feedToDisplay.items.map(i => i.id));
          const taggedItemsMap = new Map(
            allArticles
              .filter(a => a.feedId === viewForFiltering.value && articleIdsInFeed.has(a.id))
              .map(a => [a.id, a])
          );
          rawArticles = feedToDisplay.items.map(item => taggedItemsMap.get(item.id) || item);
        } else {
          rawArticles = [];
        }
        break;
      }
      case 'search':
        if (!viewForFiltering.value) {
          rawArticles = [];
        } else {
          const query = viewForFiltering.value.toLowerCase();
          rawArticles = allArticles.filter(
            a =>
              a.title.toLowerCase().includes(query) || a.description.toLowerCase().includes(query)
          );
        }
        needsDeduplication = true;
        break;
      case 'readLater':
        rawArticles = Array.from(readLaterArticleIds)
          .map(id => articlesById.get(id))
          .filter((a): a is Article => !!a);
        break;
      case 'history':
        rawArticles = Array.from(readArticleIds.keys())
          .map(id => articlesById.get(id))
          .filter((a): a is Article => !!a);
        break;
      case 'favorites': {
        const favoriteFeedIds = new Set(favoriteFeeds.map(f => f.id));
        rawArticles = allArticles.filter(a => favoriteFeedIds.has(a.feedId));
        needsDeduplication = true;
        break;
      }
      case 'tag':
        rawArticles = filterArticlesForTag(allArticles, viewForFiltering.value, feedsById);
        needsDeduplication = true;
        break;
      case 'published-today': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        rawArticles = allArticles.filter(
          a => a.pubDateTimestamp && a.pubDateTimestamp >= todayTimestamp
        );
        needsDeduplication = true;
        break;
      }
      case 'ai-summary-yt':
        rawArticles = allArticles.filter(a => a.isVideo && (a.summary || a.structuredSummary));
        needsDeduplication = true;
        break;
      case 'yt-transcripts':
        rawArticles = allArticles.filter(a => a.isVideo && a.transcript && a.transcript.length > 0);
        needsDeduplication = true;
        break;
      case 'ai-topic': {
        let targetIds = new Set<string>();
        const val = viewForFiltering.value;
        if (val && typeof val === 'object' && Array.isArray(val.articleIds)) {
          targetIds = new Set(val.articleIds);
        } else if (typeof val === 'string' && (aiHierarchy || ytAiHierarchy || nonYtAiHierarchy)) {
          const ids = (aiHierarchy ? findArticleIdsForTopic(aiHierarchy, val) : [])
            .concat(ytAiHierarchy ? findArticleIdsForTopic(ytAiHierarchy, val) : [])
            .concat(nonYtAiHierarchy ? findArticleIdsForTopic(nonYtAiHierarchy, val) : []);
          targetIds = new Set(ids);
        } else if (
          val &&
          typeof val === 'object' &&
          val.title &&
          typeof val.title === 'string' &&
          (aiHierarchy || ytAiHierarchy || nonYtAiHierarchy)
        ) {
          // Fallback if articleIds is missing but title is present in object
          const ids = (aiHierarchy ? findArticleIdsForTopic(aiHierarchy, val.title) : [])
            .concat(ytAiHierarchy ? findArticleIdsForTopic(ytAiHierarchy, val.title) : [])
            .concat(nonYtAiHierarchy ? findArticleIdsForTopic(nonYtAiHierarchy, val.title) : []);
          targetIds = new Set(ids);
        }
        rawArticles = allArticles.filter(a => targetIds.has(a.id));
        needsDeduplication = true;
        break;
      }
      default:
        rawArticles = [];
    }

    const tabFilteredArticles = rawArticles.filter(article => {
      const feed = feedsById.get(article.feedId);
      if (!feed) return false;
      const isYouTubeFeed = feed.url.toLowerCase().includes('youtube.com');

      if (sidebarTab === 'yt') {
        return isYouTubeFeed;
      } else {
        return !isYouTubeFeed;
      }
    });

    const sortArticles = (articles: Article[]): Article[] => {
      const sortByCustomOrder = (order: string[]) => {
        const orderMap = new Map(order.map((id, index) => [id, index]));
        return [...articles].sort((a, b) => {
          const aIndex = orderMap.get(a.id);
          const bIndex = orderMap.get(b.id);
          if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
          if (aIndex !== undefined) return 1;
          if (bIndex !== undefined) return -1;
          return (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0);
        });
      };

      if (
        viewForFiltering.type === 'feed' &&
        articles.length > 0 &&
        articles.some(a => a.order !== undefined)
      ) {
        return [...articles].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      }
      if (viewForFiltering.type === 'history') {
        return [...articles].sort(
          (a, b) => (readArticleIds.get(b.id) || 0) - (readArticleIds.get(a.id) || 0)
        );
      }
      if (viewForFiltering.type === 'readLater') {
        const source = viewForFiltering.value || 'yt';
        return sortByCustomOrder(source === 'yt' ? readLaterOrderYt : readLaterOrderRss);
      }
      if (viewForFiltering.type === 'tag') {
        const tagValue = viewForFiltering.value;
        let tagKey: string | undefined;
        if (typeof tagValue === 'object' && tagValue.name && tagValue.type) {
          tagKey = `${tagValue.type}-${tagValue.name}`;
        } else if (typeof tagValue === 'string') {
          tagKey = tagValue;
        }

        if (tagKey) {
          const order = tagOrders[tagKey];
          if (order) return sortByCustomOrder(order);
        }
      }
      if (viewForFiltering.type === 'favorites') {
        const source = viewForFiltering.value || 'yt';
        return sortByCustomOrder(source === 'yt' ? favoritesOrderYt : favoritesOrderRss);
      }
      return [...articles].sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));
    };
    const processedArticles = sortArticles(
      needsDeduplication ? deduplicateArticles(tabFilteredArticles) : tabFilteredArticles
    );

    let finalArticles = processedArticles;
    if (
      ['favorites', 'published-today', 'readLater', 'history'].includes(viewForFiltering.type) &&
      activeTagFilter
    ) {
      finalArticles = processedArticles.filter(article => article.tags?.includes(activeTagFilter));
    }

    return finalArticles;
  }, [
    backgroundView,
    feedsById,
    allArticles,
    readLaterArticleIds,
    readArticleIds,
    articlesById,
    favoriteFeeds,
    activeTagFilter,
    readLaterOrderYt,
    readLaterOrderRss,
    tagOrders,
    favoritesOrderYt,
    favoritesOrderRss,
    sidebarTab,
  ]);

  const articleNavigation = useMemo(() => {
    if (!selectedArticle)
      return {
        hasNextArticle: false,
        hasPreviousArticle: false,
        onNextArticle: () => {},
        onPreviousArticle: () => {},
      };
    const currentIndex = articlesForNavigation.findIndex(a => a.id === selectedArticle.id);
    const hasNextArticle = currentIndex >= 0 && currentIndex < articlesForNavigation.length - 1;
    const hasPreviousArticle = currentIndex > 0;
    const onNextArticle = () => {
      if (hasNextArticle) {
        const nextArticle = articlesForNavigation[currentIndex + 1];
        handleOpenArticle(nextArticle);
      }
    };
    const onPreviousArticle = () => {
      if (hasPreviousArticle) {
        const prevArticle = articlesForNavigation[currentIndex - 1];
        handleOpenArticle(prevArticle);
      }
    };
    return { hasNextArticle, hasPreviousArticle, onNextArticle, onPreviousArticle };
  }, [selectedArticle, articlesForNavigation, handleOpenArticle]);

  const inactiveFeeds = useMemo(() => {
    const periodInMs = (months: number) => months * 30 * 24 * 60 * 60 * 1000;
    const cutoffTimestamp =
      Date.now() - (inactivePeriod === 'all' ? periodInMs(1) : periodInMs(inactivePeriod));

    return feedsToShowInApp
      .map(feed => {
        const lastPost = feed.items.reduce(
          (latest, item) => Math.max(latest, item.pubDateTimestamp || 0),
          0
        );
        return { ...feed, lastPostTimestamp: lastPost };
      })
      .filter((feed: Feed & { lastPostTimestamp: number }) => {
        if (feed.error) return true;
        if (feed.lastPostTimestamp === 0 && feed.items.length > 0) return false;
        if (feed.lastPostTimestamp === 0) return true;
        return feed.lastPostTimestamp < cutoffTimestamp;
      })
      .sort((a, b) => a.lastPostTimestamp - b.lastPostTimestamp);
  }, [feedsToShowInApp, inactivePeriod]);

  useEffect(() => {
    const handleHashChange = async () => {
      setIsViewLoading(true);
      try {
        const newView = getInitialView();
        setCurrentView(newView);
        setActiveTagFilter(null);

        if (newView.type !== 'article') {
          setBackgroundView(newView);
        }

        if (newView.type === 'feed') {
          setSelectedFeedId(newView.value || null);
        } else if (
          [
            'tag',
            'favorites',
            'readLater',
            'history',
            'published-today',
            'all-subscriptions',
            'search',
            'note-folder',
            'keyword-articles',
          ].includes(newView.type)
        ) {
          setSelectedFeedId(null);
        }

        if (newView.type === 'import') {
          setImportCodeFromUrl(newView.value || null);
          setIsImportTextModalOpen(true);
        }

        if (newView.type === 'add-feed-from-url') {
          setUrlFromExtension(newView.value || null);
          setAddFeedModalOpen(true);
        }

        if (newView.type === 'article' && newView.value) {
          setIsResolvingArticleUrl(true);
          try {
            const { articleId } = newView.value;
            const article = articlesById.get(articleId);

            if (article) {
              setSelectedArticle(article);
            } else {
              try {
                const isLikelyVideo = articleId.length === 11 && !articleId.includes(' ');
                if (isLikelyVideo) {
                  const fetchedArticle = await fetchSingleYouTubeVideoAsArticle(articleId);
                  setSelectedArticle(fetchedArticle);
                } else {
                  setToast({
                    message: 'Could not find the shared article in your feeds.',
                    type: 'error',
                  });
                  window.location.hash = '#/all-subscriptions';
                }
              } catch (e) {
                setToast({
                  message: `Could not load shared article: ${e instanceof Error ? e.message : 'Unknown error.'}`,
                  type: 'error',
                });
                window.location.hash = '#/all-subscriptions';
              }
            }
          } catch (e) {
            setToast({ message: 'Error loading shared article.', type: 'error' });
            window.location.hash = '#/all-subscriptions';
          } finally {
            setIsResolvingArticleUrl(false);
          }
        } else {
          setSelectedArticle(null);
        }
      } finally {
        setIsViewLoading(false);
      }
    };

    if (isInitialLoad) {
      const initialFeeds = getStoredData<Feed[]>(FEEDS_STORAGE_KEY, []);
      const cachedArticles = getStoredData<Record<string, Article[]>>(ARTICLES_CACHE_KEY, {});

      const mergedFeeds = initialFeeds.map(feed => {
        const cached = cachedArticles[feed.id];
        if (cached && cached.length > 0) {
          const cachedItemsMap = new Map(cached.map(item => [item.id, item]));
          const combinedItems = [
            ...cached,
            ...feed.items.filter(item => !cachedItemsMap.has(item.id)),
          ];
          const uniqueItems = Array.from(
            new Map(combinedItems.map(item => [item.id, item])).values()
          );
          return { ...feed, items: uniqueItems };
        }
        return feed;
      });
      setFeeds(mergedFeeds);
      setIsInitialLoad(false);
      handleHashChange();
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isInitialLoad, articlesById, feeds]);

  useEffect(() => {
    const checkDriveStatus = async () => {
      if (!accessToken) {
        setDriveSyncStatus({ status: 'checking' });
        return;
      }
      setDriveSyncStatus({ status: 'checking' });
      try {
        await verifyDrivePermissions(accessToken);
        const metadata = await getDriveFileMetadata(accessToken);
        setDriveSyncStatus({ status: 'ready', fileMetadata: metadata });
      } catch (e: any) {
        if (e.isPermissionError) {
          setDriveSyncStatus({ status: 'no_permission', error: e.message });
        } else if (!e.isAuthError) {
          setDriveSyncStatus({ status: 'error', error: e.message });
        }
      }
    };
    checkDriveStatus();
  }, [accessToken]);

  const handleSetTagFilter = useCallback((tag: string | null) => {
    setActiveTagFilter(tag);
  }, []);
  const calculateStorageSize = useCallback(() => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) total += value.length;
      }
    }
    const sizeInKB = total / 1024;
    return sizeInKB > 1024 ? `${(sizeInKB / 1024).toFixed(2)} MB` : `${sizeInKB.toFixed(2)} KB`;
  }, []);

  const handleClearProxyStats = useCallback(() => {
    setProxyStats({});
    setToast({ message: 'Network statistics have been cleared.', type: 'success' });
  }, [setToast]);
  const handleToggleProxy = useCallback(
    (proxyName: string, feedType: FeedType) => {
      setDisabledProxies(prev => {
        const compositeKey = `${proxyName}_${feedType}`;
        const newSet = new Set(prev);
        const action = newSet.has(compositeKey) ? 'enabled' : 'disabled';

        if (action === 'enabled') {
          newSet.delete(compositeKey);
        } else {
          newSet.add(compositeKey);
        }

        setToast({
          message: `${proxyName} proxy ${action} for ${feedType.toUpperCase()} feeds.`,
          type: 'success',
        });
        return newSet;
      });
    },
    [setToast]
  );
  const handleResetNetworkSettings = useCallback(() => {
    setDisabledProxies(new Set());
    setProxyStats({});
    localStorage.removeItem(DISABLED_PROXIES_KEY);
    localStorage.removeItem(PROXY_STATS_KEY);
    setToast({
      message: 'Network settings and statistics have been reset.',
      type: 'success',
    });
  }, [setToast]);

  const handleGoogleSignOut = useCallback(() => {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    setAccessToken(null);
    setUserProfile(null);
    localStorage.removeItem('gapi_access_token');
    localStorage.removeItem('gapi_access_token_expires_at');
    localStorage.removeItem('gapi_user_profile');
    setToast({ message: 'You have been signed out.', type: 'success' });
  }, [accessToken, setToast]);

  const handleUploadToDrive = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!accessToken) {
        setToast({ message: 'Please sign in to sync with Google Drive.', type: 'error' });
        handleGoogleSignIn({ showConsentPrompt: true });
        throw new Error('Not authenticated for Drive upload.');
      }

      if (!options?.silent) {
        setToast({ message: 'Uploading data to Google Drive...', type: 'success' });
      }

      const articlesByFeedUrl: Record<string, Article[]> = {};
      feeds.forEach(feed => {
        articlesByFeedUrl[feed.url] = feed.items.map(item => {
          const { sources, ...restItem } = item;
          return restItem as Article;
        });
      });

      const dataToExport: SyncData = {
        feeds: feeds.map(({ id, items, error, ...rest }) => rest),
        articlesByFeedUrl,
        readLaterArticleIds: Array.from(readLaterArticleIds),
        readArticleIds: Array.from(readArticleIds.entries()),
        likedVideoIds: Array.from(likedVideoIds),
        gridZoomLevel,
        articleZoomLevel,
        autoplayMode,
        articleTags: Array.from(articleTags.entries()),
        readLaterOrderYt,
        readLaterOrderRss,
        tagOrders,
        favoritesOrderYt,
        favoritesOrderRss,
        notes,
        noteFolders,
        highlights,
      };
      try {
        const { modifiedTime } = await saveDataToDrive(dataToExport, accessToken);
        const fileId =
          driveSyncStatus.fileMetadata?.id || (await getDriveFileMetadata(accessToken))?.id;
        setDriveSyncStatus(prev => ({
          ...prev,
          status: 'ready',
          fileMetadata: { ...prev.fileMetadata, id: fileId!, modifiedTime },
        }));
        if (!options?.silent) {
          setToast({ message: 'Data successfully uploaded to Google Drive.', type: 'success' });
        }
      } catch (e: any) {
        if (e.isPermissionError) {
          setDriveSyncStatus({ status: 'no_permission', error: e.message });
        }
        throw e;
      }
    },
    [
      accessToken,
      feeds,
      readLaterArticleIds,
      readArticleIds,
      likedVideoIds,
      gridZoomLevel,
      articleZoomLevel,
      autoplayMode,
      articleTags,
      readLaterOrderYt,
      readLaterOrderRss,
      tagOrders,
      favoritesOrderYt,
      favoritesOrderRss,
      notes,
      noteFolders,
      driveSyncStatus.fileMetadata,
      setToast,
      handleGoogleSignIn,
    ]
  );

  const handleDownloadFromDrive = useCallback(async () => {
    if (!accessToken) {
      setToast({ message: 'Please sign in to sync with Google Drive.', type: 'error' });
      handleGoogleSignIn({ showConsentPrompt: true });
      throw new Error('Not authenticated for Drive download.');
    }

    setToast({ message: 'Checking Google Drive for data...', type: 'success' });

    try {
      const { data, metadata } = await loadDataFromDrive(accessToken);

      if (data) {
        handleImportData(data, { silent: true });
        setDriveSyncStatus({ status: 'ready', fileMetadata: metadata });
        setToast({
          message: 'Data successfully downloaded and imported from Google Drive.',
          type: 'success',
        });
      } else {
        setDriveSyncStatus({ status: 'ready', fileMetadata: metadata });
        setToast({
          message: 'No sync data found in your Google Drive. Upload data from a device first.',
          type: 'error',
        });
      }
    } catch (e: any) {
      if (e.isPermissionError) {
        setDriveSyncStatus({ status: 'no_permission', error: e.message });
      }
      throw e;
    }
  }, [accessToken, handleImportData, setToast, handleGoogleSignIn]);

  useEffect(() => {
    if (triggerAutoUpload) {
      handleUploadToDrive({ silent: true })
        .catch(e => {
          console.error('Auto-upload after refresh failed:', e);
          setToast({
            message: `Auto-upload failed: ${e instanceof Error ? e.message : 'Unknown error.'}`,
            type: 'error',
          });
        })
        .finally(() => {
          setTriggerAutoUpload(false);
        });
    }
  }, [triggerAutoUpload, handleUploadToDrive, setToast]);

  const isYouTubeFeed = (feed: Feed) => feed.url.toLowerCase().includes('youtube.com');

  const batchRefreshHandler = useCallback(
    async (
      feedsToRefresh: Feed[],
      viewTitle: string,
      limits?: { ytMax: number; nonYtMax: number }
    ) => {
      if (feedsToRefresh.length === 0) {
        setToast({ message: `No feeds to refresh in ${viewTitle}.`, type: 'error' });
        return;
      }

      setIsRefreshingAll(true);
      setRefreshProgress(1);
      isRefreshingRef.current = true;

      setToast({ message: `Refreshing ${viewTitle}...`, type: 'success' });

      try {
        const totalFeeds = feedsToRefresh.length;
        let processedCount = 0;
        let totalFailedCount = 0;
        const allNewArticles: Article[] = [];

        const processBatchResults = (
          results: {
            status: 'fulfilled' | 'rejected';
            value?: Feed;
            reason?: any;
            originalFeed: Feed;
          }[]
        ) => {
          const successfulFeeds: Feed[] = [];
          const failedFeeds: (Feed & { error: string })[] = [];

          results.forEach(result => {
            const originalFeed = result.originalFeed;
            if (result.status === 'fulfilled' && result.value) {
              const newFeedData = result.value;
              if (newFeedData.items.length === 0 && originalFeed.items.length > 0) {
                failedFeeds.push({
                  ...originalFeed,
                  error: 'Refresh returned an empty feed. Old articles kept.',
                });
                return;
              }

              newFeedData.items.forEach(item => {
                item.feedId = originalFeed.id;
              });

              const existingArticles = new Map(originalFeed.items.map(a => [a.id, a]));
              const newArticlesInFeed = newFeedData.items.filter(a => !existingArticles.has(a.id));
              allNewArticles.push(...newArticlesInFeed);

              const combinedArticles = [...newArticlesInFeed, ...originalFeed.items];
              const deduplicatedArticles = Array.from(
                new Map(combinedArticles.map(a => [a.id, a])).values()
              );

              const sortedAndCleanedArticles = deduplicatedArticles
                .map(({ order, ...rest }) => rest)
                .sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));

              successfulFeeds.push({
                ...newFeedData,
                isFavorite: originalFeed.isFavorite,
                tags: originalFeed.tags,
                items: sortedAndCleanedArticles,
                iconUrl: newFeedData.iconUrl || originalFeed.iconUrl,
                error: null,
                maxArticles: originalFeed.maxArticles,
              });
            } else {
              const error =
                result.reason instanceof Error ? result.reason.message : String(result.reason);
              failedFeeds.push({ ...originalFeed, error });
            }
          });

          setFeeds(currentFeeds => {
            const updatedFeedsMap = new Map(currentFeeds.map(f => [f.id, f]));
            successfulFeeds.forEach(f => updatedFeedsMap.set(f.id, f));
            failedFeeds.forEach(f => {
              const existing = updatedFeedsMap.get(f.id);
              if (existing) updatedFeedsMap.set(f.id, { ...existing, error: f.error });
            });
            const nextFeeds = Array.from(updatedFeedsMap.values());
            feedsRef.current = nextFeeds;
            return nextFeeds;
          });

          if (successfulFeeds.length > 0) {
            updateArticlesCache(successfulFeeds);
          }

          processedCount += results.length;
          totalFailedCount += failedFeeds.length;
          setRefreshProgress((processedCount / totalFeeds) * 100);
        };

        const CHUNK_SIZE = refreshBatchSize;
        const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        for (let i = 0; i < feedsToRefresh.length; i += CHUNK_SIZE) {
          const chunk = feedsToRefresh.slice(i, i + CHUNK_SIZE);

          const promises = chunk.map(async feed => {
            try {
              const isYt = isYouTubeFeed(feed);
              let maxArticlesForFeed: number | undefined;
              if (limits) {
                maxArticlesForFeed = isYt ? limits.ytMax : limits.nonYtMax;
              } else {
                maxArticlesForFeed = feed.maxArticles;
              }

              if (feed.isPlaylist) {
                let playlistFeed: Feed | null = null;
                if (accessToken) {
                  try {
                    const playlistId = new URL(feed.url).searchParams.get('list');
                    if (!playlistId) throw new Error('Invalid playlist URL.');
                    playlistFeed = await fetchPlaylistAsFeed(playlistId, accessToken);
                  } catch (reason: any) {
                    if (!reason.isAuthError) throw reason;
                    playlistFeed = null;
                  }
                }
                if (!playlistFeed) {
                  playlistFeed = await fetchAndParseRss(
                    feed.url,
                    feed.title,
                    handleProxyAttempt,
                    disabledProxies,
                    proxyStats,
                    maxArticlesForFeed
                  );

                  // Fetch durations for YouTube playlist videos if we have access token
                  const hasVideoItems = playlistFeed.items.some(item => item.isVideo && item.id);

                  if (accessToken && hasVideoItems) {
                    try {
                      const videoIds = playlistFeed.items
                        .filter(item => item.isVideo && item.id)
                        .map(item => item.id);

                      if (videoIds.length > 0) {
                        const durationsAndCaptions = await fetchVideosDuration(
                          videoIds,
                          accessToken
                        );

                        playlistFeed.items = playlistFeed.items.map(item => {
                          const data = durationsAndCaptions.get(item.id);
                          return {
                            ...item,
                            duration: data?.duration || item.duration,
                            hasCaption: data?.hasCaption || false,
                          };
                        });
                      }
                    } catch (error) {
                      // Continue without durations - non-critical
                    }
                  }
                }
                return { status: 'fulfilled' as const, value: playlistFeed, originalFeed: feed };
              } else {
                const rssFeed = await fetchAndParseRss(
                  feed.url,
                  feed.title,
                  handleProxyAttempt,
                  disabledProxies,
                  proxyStats,
                  maxArticlesForFeed
                );

                // Fetch durations for YouTube channel videos if we have access token
                const hasVideoItems = rssFeed.items.some(item => item.isVideo && item.id);

                if (accessToken && hasVideoItems) {
                  try {
                    const videoIds = rssFeed.items
                      .filter(item => item.isVideo && item.id)
                      .map(item => item.id);

                    if (videoIds.length > 0) {
                      const durationsAndCaptions = await fetchVideosDuration(videoIds, accessToken);

                      rssFeed.items = rssFeed.items.map(item => {
                        const data = durationsAndCaptions.get(item.id);
                        return {
                          ...item,
                          duration: data?.duration || item.duration,
                          hasCaption: data?.hasCaption || false,
                        };
                      });
                    }
                  } catch (error) {
                    // Continue without durations - non-critical
                  }
                }

                return { status: 'fulfilled' as const, value: rssFeed, originalFeed: feed };
              }
            } catch (reason) {
              return { status: 'rejected' as const, reason, originalFeed: feed };
            }
          });

          processBatchResults(await Promise.all(promises));

          if (i + CHUNK_SIZE < totalFeeds) {
            await wait(refreshDelaySeconds * 1000);
          }
        }

        const successCount = totalFeeds - totalFailedCount;
        if (totalFailedCount > 0) {
          setToast({
            message: `Refresh complete. ${successCount} succeeded, ${totalFailedCount} failed.`,
            type: 'error',
          });
        } else {
          setToast({
            message: `Refresh complete. All ${successCount} feeds updated.`,
            type: 'success',
          });
        }

        console.log('[Refresh] Refresh complete. Triggering background tasks...');
        console.log(`[Refresh] New articles found: ${allNewArticles.length}`);

        // Clear the refresh flag BEFORE triggering background tasks
        isRefreshingRef.current = false;

        // Chain background tasks: Transcription -> Summary -> Grouping
        // Use a longer delay to ensure React has fully settled after heavy batch processing
        console.log('[Refresh] Triggering background sequence in 500ms...');
        setTimeout(() => {
          const latestFeeds = feedsRef.current;
          const allItems = latestFeeds.flatMap(f => f.items);
          const newestItem = allItems.sort(
            (a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0)
          )[0];

          console.log(
            `[Refresh] Background task START: ${latestFeeds.length} feeds, ${allItems.length} total articles.`
          );
          if (newestItem) {
            console.log(
              `[Refresh] Newest article in state: "${newestItem.title}" (${new Date(newestItem.pubDateTimestamp || 0).toLocaleString()})`
            );
          }

          // Chain the tasks sequentially: Transcription -> Summary -> Grouping
          runInBackgroundTranscription(latestFeeds).then(() => {
            console.log('[Refresh] Transcription sequence finished.');
            runInBackgroundSummaryGeneration(latestFeeds).then(() => {
              console.log('[Refresh] Summary sequence finished. Initiating AI grouping...');
              runInBackgroundGrouping(latestFeeds);
            });
          });
        }, 500);

        if (autoUploadAfterRefresh) {
          setTriggerAutoUpload(true);
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : 'An unknown error occurred.';
        setToast({
          message: `An unexpected error occurred during refresh: ${error}`,
          type: 'error',
        });
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshingAll(false);
        setRefreshProgress(null);
      }
    },
    [
      setToast,
      updateArticlesCache,
      handleProxyAttempt,
      disabledProxies,
      proxyStats,
      refreshBatchSize,
      refreshDelaySeconds,
      accessToken,
      autoUploadAfterRefresh,
      runInBackgroundTranscription,
      runInBackgroundSummaryGeneration,
      runInBackgroundGrouping,
    ]
  );

  const handleExecuteRefresh = useCallback(
    async (options: RefreshOptions) => {
      setIsRefreshOptionsModalOpen(false);

      let feedsToRefresh: Feed[] = [];
      let viewTitle = '';

      if (options.favoritesOnly) {
        feedsToRefresh = favoriteFeeds;
        viewTitle = 'favorite feeds';
      } else {
        const ytFeedsToRefresh = options.yt ? feeds.filter(isYouTubeFeed) : [];
        const nonYtFeedsToRefresh = options.nonYt ? feeds.filter(f => !isYouTubeFeed(f)) : [];
        feedsToRefresh = [...ytFeedsToRefresh, ...nonYtFeedsToRefresh];

        if (options.yt && options.nonYt) viewTitle = 'all feeds';
        else if (options.yt) viewTitle = 'all YouTube feeds';
        else if (options.nonYt) viewTitle = 'all non-YouTube feeds';
      }

      if (feedsToRefresh.length > 0) {
        await batchRefreshHandler(feedsToRefresh, viewTitle, {
          ytMax: options.ytMax,
          nonYtMax: options.nonYtMax,
        });
      } else {
        setToast({ message: 'No feeds selected to refresh.', type: 'error' });
      }
    },
    [feeds, favoriteFeeds, batchRefreshHandler, setToast]
  );

  const handleRefreshAllTranscripts = useCallback(async () => {
    setIsRefreshingAll(true);
    setRefreshProgress(0);
    setToast({ message: 'Refreshing all transcripts...', type: 'success' });

    try {
      // 1. Collect all video articles that need processing
      const allVideos: { feedId: string; article: Article }[] = [];
      feeds.forEach(feed => {
        feed.items.forEach(article => {
          if (article.isVideo && article.link) {
            allVideos.push({ feedId: feed.id, article });
          }
        });
      });

      // Sort videos by publication date (newest first)
      allVideos.sort((a, b) => {
        const dateA = a.article.pubDate ? new Date(a.article.pubDate).getTime() : 0;
        const dateB = b.article.pubDate ? new Date(b.article.pubDate).getTime() : 0;
        return dateB - dateA;
      });

      const total = allVideos.length;
      if (total === 0) {
        setToast({ message: 'No videos found to refresh.', type: 'error' });
        setIsRefreshingAll(false);
        return;
      }

      let processedCount = 0;
      let successCount = 0;
      const CHUNK_SIZE = 1; // Process 1 at a time to avoid IP blocking

      // We'll update a map of changed articles to apply at the end (or per chunk)
      // Key: feedId, Value: Map<articleId, Article>
      const feedUpdates = new Map<string, Map<string, Article>>();

      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = allVideos.slice(i, i + CHUNK_SIZE);

        // Add random delay between 2-5 seconds to simulate human behavior
        if (i > 0) {
          const delay = Math.floor(Math.random() * 3000) + 2000;
          await wait(delay);
        }

        await Promise.all(
          chunk.map(async ({ feedId, article }) => {
            try {
              const videoId = getYouTubeId(article.link!);
              if (!videoId) return;

              // Force fetch choices and transcript
              const choices = await fetchAvailableCaptionChoices(videoId);
              if (choices.length > 0) {
                const transcript = await fetchAndParseTranscript(choices[0].url);
                if (transcript && transcript.length > 0) {
                  // Stage update
                  if (!feedUpdates.has(feedId)) {
                    feedUpdates.set(feedId, new Map());
                  }
                  feedUpdates.get(feedId)!.set(article.id, {
                    ...article,
                    transcript,
                    transcriptAttempted: true,
                  });
                  successCount++;
                }
              }
            } catch (e) {
              console.warn(`Failed to refresh transcript for ${article.title}:`, e);
              // Optionally mark as attempted failed?
              if (!feedUpdates.has(feedId)) {
                feedUpdates.set(feedId, new Map());
              }
              // Keep old transcript if exists, but mark attempted
              feedUpdates.get(feedId)!.set(article.id, {
                ...article,
                transcriptAttempted: true,
              });
            }
          })
        );

        processedCount += chunk.length;
        setRefreshProgress((processedCount / total) * 100);

        // Optional: Update state incrementally if needed, but doing it at end is cleaner providing the list isn't huge.
        // For UI responsiveness on large sets, maybe update every few chunks?
        // Let's update at the end for simplicity first.
      }

      // Apply updates
      if (feedUpdates.size > 0) {
        setFeeds(currentFeeds => {
          return currentFeeds.map(feed => {
            const updatesForFeed = feedUpdates.get(feed.id);
            if (!updatesForFeed) return feed;

            const newItems = feed.items.map(item => {
              const updated = updatesForFeed.get(item.id);
              return updated ? updated : item;
            });
            return { ...feed, items: newItems };
          });
        });
      }

      setToast({
        message: `Transcript refresh complete. Updated ${successCount} videos.`,
        type: 'success',
      });
    } catch (e) {
      console.error('Error refreshing transcripts:', e);
      setToast({ message: 'Error refreshing transcripts.', type: 'error' });
    } finally {
      setIsRefreshingAll(false);
      setRefreshProgress(null);
    }
  }, [feeds, setToast]);

  const handleRefreshSingleFeed = useCallback(
    async (feedId: string) => {
      const feedToRefresh = feeds.find(f => f.id === feedId);
      if (!feedToRefresh) return;

      setRefreshingFeedId(feedId);
      try {
        let newFeedData: Feed | null = null;
        const maxArticlesForFeed =
          feedToRefresh.maxArticles || (isYouTubeFeed(feedToRefresh) ? 5 : 10);

        if (feedToRefresh.isPlaylist) {
          if (accessToken) {
            try {
              const playlistId = new URL(feedToRefresh.url).searchParams.get('list');
              if (!playlistId) throw new Error('Invalid YouTube playlist URL for refresh.');
              newFeedData = await fetchPlaylistAsFeed(playlistId, accessToken);
            } catch (e: any) {
              if (e.isAuthError) {
                newFeedData = null;
              } else {
                throw e;
              }
            }
          }
          if (!newFeedData) {
            newFeedData = await fetchAndParseRss(
              feedToRefresh.url,
              feedToRefresh.title,
              handleProxyAttempt,
              disabledProxies,
              proxyStats,
              maxArticlesForFeed
            );
          }
        } else {
          newFeedData = await fetchAndParseRss(
            feedToRefresh.url,
            feedToRefresh.title,
            handleProxyAttempt,
            disabledProxies,
            proxyStats,
            maxArticlesForFeed
          );
        }

        // Fetch durations for YouTube videos if we have access token (for single feed refresh)
        if (accessToken && newFeedData && isYouTubeFeed(feedToRefresh)) {
          const hasVideoItems = newFeedData.items.some(item => item.isVideo && item.id);
          if (hasVideoItems) {
            try {
              // Filter out items that already have duration (e.g. from playlist fetch)
              const videoIds = newFeedData.items
                .filter(item => item.isVideo && item.id && item.duration === undefined)
                .map(item => item.id);

              if (videoIds.length > 0) {
                const durationsAndCaptions = await fetchVideosDuration(videoIds, accessToken);

                newFeedData.items = newFeedData.items.map(item => {
                  const data = durationsAndCaptions.get(item.id);
                  return {
                    ...item,
                    duration: data?.duration || item.duration,
                    hasCaption: data?.hasCaption || false,
                  };
                });
              }
            } catch (error) {
              console.warn('Failed to fetch video durations for single refresh:', error);
            }
          }
        }

        if (
          newFeedData.items.length === 0 &&
          feedToRefresh.items &&
          feedToRefresh.items.length > 0
        ) {
          throw new Error(
            'Refresh failed: The source returned an empty feed. Old articles have been kept.'
          );
        }

        newFeedData.items.forEach(item => {
          item.feedId = feedToRefresh.id;
        });

        // Merge logic: Prefer new articles (which have updated data like duration) over existing ones
        const newItemsMap = new Map(newFeedData.items.map(a => [a.id, a]));
        const oldItemsToKeep = feedToRefresh.items.filter(a => !newItemsMap.has(a.id));
        const combinedArticles = [...newFeedData.items, ...oldItemsToKeep];
        const deduplicatedArticles = Array.from(
          new Map(combinedArticles.map(a => [a.id, a])).values()
        );

        const sortedAndCleanedArticles = deduplicatedArticles
          .map(({ order, ...rest }) => rest)
          .sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));

        const updatedFeed: Feed = {
          ...newFeedData,
          isFavorite: feedToRefresh.isFavorite,
          tags: feedToRefresh.tags,
          items: sortedAndCleanedArticles,
          iconUrl: newFeedData.iconUrl || feedToRefresh.iconUrl,
          error: null,
          maxArticles: feedToRefresh.maxArticles,
        };

        setFeeds(currentFeeds => {
          return currentFeeds.map(f => (f.id === feedId ? updatedFeed : f));
        });

        updateArticlesCache([updatedFeed]);

        setToast({ message: `Refreshed "${updatedFeed.title}"`, type: 'success' });

        runInBackgroundTranscription([updatedFeed]).then(() => {
          runInBackgroundSummaryGeneration([updatedFeed]);
        });

        if (autoUploadAfterRefresh) {
          setTriggerAutoUpload(true);
        }
      } catch (e: any) {
        const error = e instanceof Error ? e.message : 'An unknown error occurred.';
        setFeeds(currentFeeds => currentFeeds.map(f => (f.id === feedId ? { ...f, error } : f)));
        setToast({
          message: `Failed to refresh "${feedToRefresh.title}": ${error}`,
          type: 'error',
        });
      } finally {
        setRefreshingFeedId(null);
      }
    },
    [
      feeds,
      accessToken,
      updateArticlesCache,
      handleProxyAttempt,
      disabledProxies,
      proxyStats,
      setToast,
      autoUploadAfterRefresh,
      runInBackgroundSummaryGeneration,
    ]
  );

  const handleRefreshCurrentView = useCallback(async () => {
    let feedsToRefresh: Feed[] = [];
    let viewTitle = '';
    if (currentView.type === 'favorites') {
      feedsToRefresh = favoriteFeeds;
      viewTitle = 'favorite feeds';
    } else if (currentView.type === 'tag') {
      const tag =
        typeof currentView.value === 'object' ? currentView.value.name : currentView.value;
      feedsToRefresh = feeds.filter(f => f.tags?.includes(tag));
      viewTitle = `feeds tagged #${tag}`;
    } else {
      setToast({ message: `Cannot refresh this view.`, type: 'error' });
      return;
    }
    await batchRefreshHandler(feedsToRefresh, viewTitle);
  }, [currentView, feeds, favoriteFeeds, batchRefreshHandler, setToast]);

  const handleRefreshMissingIcons = useCallback(async () => {
    const feedsToRefresh = feeds.filter(
      f => f.url.toLowerCase().includes('youtube.com') && !f.iconUrl
    );
    if (feedsToRefresh.length === 0) {
      setToast({ message: 'No YouTube feeds with missing icons found.', type: 'success' });
      return;
    }
    await batchRefreshHandler(feedsToRefresh, `${feedsToRefresh.length} feeds with missing icons`);
  }, [batchRefreshHandler, feeds, setToast]);
  const handleClearSearch = useCallback(() => {
    if (currentView.type === 'search') {
      handleViewChange('all-subscriptions');
    }
  }, [currentView, handleViewChange]);

  const handleDeleteFeed = useCallback(
    (feedId: string) => {
      const feedToDelete = feeds.find(f => f.id === feedId);
      if (
        feedToDelete &&
        window.confirm(`Are you sure you want to delete the feed "${feedToDelete.title}"?`)
      ) {
        setFeeds(prevFeeds => prevFeeds.filter(f => f.id !== feedId));
        if (currentView.type === 'feed' && currentView.value === feedId) {
          handleViewChange('all-subscriptions');
        }
        setToast({ message: `Deleted "${feedToDelete.title}"`, type: 'success' });
      }
    },
    [feeds, currentView, handleViewChange, setToast]
  );
  const handleDeleteTag = useCallback(
    (tagToDelete: string) => {
      if (
        window.confirm(
          `Are you sure you want to delete the tag "#${tagToDelete}" from all feeds and articles? This cannot be undone.`
        )
      ) {
        setFeeds(prevFeeds =>
          prevFeeds.map(feed => {
            if (!feed.tags) return feed;
            const newTags = feed.tags.filter(tag => tag !== tagToDelete);
            return { ...feed, tags: newTags.length > 0 ? newTags : undefined };
          })
        );
        setArticleTags(prev => {
          const newMap = new Map(prev);
          for (const [articleId, tags] of newMap.entries()) {
            const newTags = tags.filter(tag => tag !== tagToDelete);
            if (newTags.length > 0) {
              newMap.set(articleId, newTags);
            } else {
              newMap.delete(articleId);
            }
          }
          return newMap;
        });

        setToast({ message: `Tag "${tagToDelete}" has been deleted.`, type: 'success' });

        if (
          currentView.type === 'tag' &&
          ((typeof currentView.value === 'string' && currentView.value === tagToDelete) ||
            (typeof currentView.value === 'object' && currentView.value.name === tagToDelete))
        ) {
          handleViewChange('all-subscriptions');
        }
      }
    },
    [feeds, articleTags, setToast, currentView, handleViewChange]
  );

  const handleRenameTag = useCallback(
    (oldName: string, newName: string) => {
      const newTagName = newName.trim().toUpperCase();
      if (!newTagName || newTagName === oldName.toUpperCase()) {
        return;
      }

      if (allTags.map(t => t.toUpperCase()).includes(newTagName)) {
        setToast({ message: `Tag "#${newTagName}" already exists.`, type: 'error' });
        return;
      }

      setFeeds(prevFeeds =>
        prevFeeds.map(feed => {
          if (!feed.tags?.includes(oldName)) return feed;
          const newTags = new Set(feed.tags.filter(t => t !== oldName));
          newTags.add(newTagName);
          return { ...feed, tags: Array.from(newTags).sort() };
        })
      );

      setArticleTags(prevArticleTags => {
        const newArticleTags = new Map<string, string[]>();
        for (const [articleId, tags] of prevArticleTags.entries()) {
          if (tags.includes(oldName)) {
            const newTags = new Set(tags.filter(t => t !== oldName));
            newTags.add(newTagName);
            newArticleTags.set(articleId, Array.from(newTags).sort());
          } else {
            newArticleTags.set(articleId, tags);
          }
        }
        return newArticleTags;
      });

      setTagOrders(prevTagOrders => {
        const newTagOrders = { ...prevTagOrders };
        const keysToUpdate = Object.keys(newTagOrders).filter(
          key => key.endsWith(`-${oldName}`) || key === oldName
        );

        for (const key of keysToUpdate) {
          const newKey = key.replace(oldName, newTagName);
          newTagOrders[newKey] = newTagOrders[key];
          delete newTagOrders[key];
        }

        return newTagOrders;
      });

      setToast({ message: `Tag "#${oldName}" renamed to "#${newTagName}".`, type: 'success' });

      if (currentView.type === 'tag') {
        let currentTagName: string;
        let currentTagType: 'youtube' | 'rss' | undefined;

        if (typeof currentView.value === 'object' && currentView.value.name) {
          currentTagName = currentView.value.name;
          currentTagType = currentView.value.type;
        } else {
          currentTagName = currentView.value;
        }

        if (currentTagName === oldName) {
          if (currentTagType) {
            handleViewChange('tag', { name: newTagName, type: currentTagType });
          } else {
            handleViewChange('tag', newTagName);
          }
        }
      }
    },
    [feeds, articleTags, tagOrders, allTags, currentView, setToast, handleViewChange]
  );

  const handleBulkDeleteFeeds = useCallback(
    (feedIds: Set<string>) => {
      if (window.confirm(`Are you sure you want to delete ${feedIds.size} selected feeds?`)) {
        setFeeds(prevFeeds => prevFeeds.filter(f => !feedIds.has(f.id)));
        if (currentView.type === 'feed' && currentView.value && feedIds.has(currentView.value)) {
          handleViewChange('all-subscriptions');
        }
        setToast({ message: `Deleted ${feedIds.size} feeds.`, type: 'success' });
      }
    },
    [feeds, currentView, handleViewChange, setToast]
  );
  const handleToggleFavorite = useCallback((feedId: string) => {
    setFeeds(prevFeeds =>
      prevFeeds.map(f => (f.id === feedId ? { ...f, isFavorite: !f.isFavorite } : f))
    );
  }, []);
  const handleSaveFeedTitle = useCallback((feedId: string, title: string) => {
    setFeeds(prevFeeds => prevFeeds.map(f => (f.id === feedId ? { ...f, title } : f)));
  }, []);
  const handleSaveFeedTags = useCallback((feedId: string, tags: string[]) => {
    setFeeds(prevFeeds =>
      prevFeeds.map(f => (f.id === feedId ? { ...f, tags: tags.length > 0 ? tags : undefined } : f))
    );
  }, []);
  const handleSaveFeedMaxArticles = useCallback((feedId: string, max: number) => {
    setFeeds(prevFeeds => prevFeeds.map(f => (f.id === feedId ? { ...f, maxArticles: max } : f)));
  }, []);
  const handleToggleReadStatus = useCallback((articleId: string) => {
    setReadArticleIds(prev => {
      const newMap = new Map(prev);
      if (newMap.has(articleId)) newMap.delete(articleId);
      else newMap.set(articleId, Date.now());
      return newMap;
    });
  }, []);
  const handleToggleReadLater = useCallback(
    (articleId: string) => {
      setReadLaterArticleIds(prev => {
        const newSet = new Set(prev);
        const article = articlesById.get(articleId);
        const isYt =
          article && feedsById.get(article.feedId)?.url.toLowerCase().includes('youtube.com');

        if (newSet.has(articleId)) {
          newSet.delete(articleId);
          if (isYt)
            setReadLaterOrderYt(currentOrder => currentOrder.filter(id => id !== articleId));
          else setReadLaterOrderRss(currentOrder => currentOrder.filter(id => id !== articleId));
        } else {
          newSet.add(articleId);
          if (isYt) setReadLaterOrderYt(currentOrder => [articleId, ...currentOrder]);
          else setReadLaterOrderRss(currentOrder => [articleId, ...currentOrder]);
        }
        return newSet;
      });
    },
    [articlesById, feedsById]
  );

  const handleGenerateDigest = useCallback(() => {
    if (selectedArticleIdsForBatch.size === 0) {
      setToast({
        message: 'Please select one or more articles or videos to create a digest from.',
        type: 'error',
      });
      return;
    }

    const selectedArticles = Array.from(selectedArticleIdsForBatch)
      .map(id => articlesById.get(id))
      .filter((a): a is Article => !!a);

    setArticlesForDigest(selectedArticles);
    setIsDigestConfigModalOpen(true);
  }, [selectedArticleIdsForBatch, articlesById, setToast]);

  const handleGenerateEbook = useCallback(async () => {
    if (selectedArticleIdsForBatch.size === 0) {
      setToast({ message: 'Please select one or more articles to create an EPUB.', type: 'error' });
      return;
    }

    const selectedArticles = Array.from(selectedArticleIdsForBatch)
      .map(id => articlesById.get(id))
      .filter((a): a is Article => !!a);

    if (selectedArticles.length === 0) {
      setToast({ message: 'Could not find selected articles.', type: 'error' });
      return;
    }

    const date = new Date().toISOString().split('T')[0];
    setEpubDefaults({
      title: `Media-Feeder Export - ${new Date().toLocaleDateString()}`,
      filename: `media-feeder-export_${date}`,
      source: 'selection',
    });
    setArticlesForEpub(selectedArticles);
    setIsEpubSettingsModalOpen(true);
  }, [selectedArticleIdsForBatch, articlesById, setToast]);

  const handleGenerateEbookFromView = useCallback(async () => {
    if (articlesToShow.length === 0) {
      setToast({
        message: 'There are no articles in the current view to create an EPUB.',
        type: 'error',
      });
      return;
    }

    const date = new Date().toISOString().split('T')[0];
    const safeHeaderTitle = headerTitle.replace(/[^a-zA-Z0-9 ]/g, '');
    const safeFileName = safeHeaderTitle.replace(/\s+/g, '_');

    setEpubDefaults({
      title: `Media-Feeder - ${safeHeaderTitle}`,
      filename: `media-feeder_${safeFileName}_${date}`,
      source: 'view',
    });
    setArticlesForEpub(articlesToShow);
    setIsEpubSettingsModalOpen(true);
  }, [articlesToShow, headerTitle, setToast]);

  const handleGenerateSummariesForSelected = useCallback(async () => {
    if (selectedArticleIdsForBatch.size === 0) {
      setToast({ message: 'No articles selected for summary generation.', type: 'error' });
      return;
    }

    setIsGeneratingSummaries(true);
    setSummaryGenerationProgress(0);
    setToast({
      message: `Checking selected articles for summarization eligibility...`,
      type: 'success',
    });

    const selectedVideos = Array.from(selectedArticleIdsForBatch)
      .map(id => articlesById.get(id))
      .filter(
        (a): a is Article =>
          !!a && !a.summary && !a.structuredSummary && !!a.isVideo && !!getYouTubeId(a.link)
      );

    if (selectedVideos.length === 0) {
      setToast({
        message:
          'No eligible videos found. Summaries are generated for YouTube videos that do not already have a summary.',
        type: 'error',
      });
      setIsGeneratingSummaries(false);
      return;
    }

    let skippedCount = 0;
    const articlesToSummarize: { article: Article; captionUrl: string }[] = [];
    for (const article of selectedVideos) {
      const videoId = getYouTubeId(article.link);
      if (videoId) {
        try {
          const choices = await fetchAvailableCaptionChoices(videoId);
          if (choices.length > 0) {
            const transcript = await fetchAndParseTranscript(choices[0].url);
            if (transcript.length < 3) {
              skippedCount++;
              continue; // Skip silently
            }
            articlesToSummarize.push({ article, captionUrl: choices[0].url });
          }
        } catch (e) {
          console.warn(`Could not check transcripts for "${article.title}":`, e);
        }
      }
    }

    if (articlesToSummarize.length === 0) {
      setToast({
        message:
          `None of the selected videos have transcripts available for summarization. ${skippedCount > 0 ? `${skippedCount} were skipped for having short transcripts.` : ''}`.trim(),
        type: 'error',
      });
      setIsGeneratingSummaries(false);
      setSummaryGenerationProgress(null);
      setSelectedArticleIdsForBatch(new Set());
      return;
    }

    setToast({
      message: `Found ${articlesToSummarize.length} videos with transcripts. Starting summarization...`,
      type: 'success',
    });

    let summarizedCount = 0;
    const totalToSummarize = articlesToSummarize.length;

    for (const { article, captionUrl } of articlesToSummarize) {
      try {
        const transcriptLines = await fetchAndParseTranscript(captionUrl);

        const { summary, sources } = await summarizeYouTubeVideo(
          article.title,
          transcriptLines,
          aiModel,
          defaultAiLanguage
        );

        handleSummaryGenerated(article.id, summary, sources);
        summarizedCount++;
      } catch (error) {
        console.error(`Failed to generate summary for "${article.title}":`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        // Don't show toast for short transcript error, just log it.
        if (!message.includes('too short')) {
          setToast({
            message: `Failed to summarize "${article.title}": ${message}`,
            type: 'error',
          });
        } else {
          skippedCount++;
        }
      } finally {
        const processedCount = summarizedCount + skippedCount;
        setSummaryGenerationProgress((processedCount / totalToSummarize) * 100);
      }
    }

    let finalMessage = `Generated summaries for ${summarizedCount} of ${totalToSummarize} eligible videos.`;
    if (skippedCount > 0) {
      finalMessage += ` ${skippedCount} were skipped.`;
    }
    setToast({ message: finalMessage, type: 'success' });
    setIsGeneratingSummaries(false);
    setSummaryGenerationProgress(null);
    setSelectedArticleIdsForBatch(new Set());
  }, [
    selectedArticleIdsForBatch,
    articlesById,
    aiModel,
    defaultAiLanguage,
    handleSummaryGenerated,
    setToast,
    setSelectedArticleIdsForBatch,
  ]);

  const handleGenerateSummariesForView = useCallback(async () => {
    if (articlesToShow.length === 0) {
      setToast({ message: 'No articles in the current view to summarize.', type: 'error' });
      return;
    }

    setIsGeneratingSummaries(true);
    setSummaryGenerationProgress(0);
    setToast({
      message: `Checking articles in view for summarization eligibility...`,
      type: 'success',
    });

    const eligibleVideos = articlesToShow.filter(
      (a): a is Article =>
        !!a && !a.summary && !a.structuredSummary && !!a.isVideo && !!getYouTubeId(a.link)
    );

    if (eligibleVideos.length === 0) {
      setToast({
        message:
          'No eligible videos found in this view. Summaries can be generated for YouTube videos that do not already have a summary.',
        type: 'error',
      });
      setIsGeneratingSummaries(false);
      return;
    }

    let skippedCount = 0;
    const articlesToSummarize: { article: Article; captionUrl: string }[] = [];
    const checkBatchSize = 10;
    for (let i = 0; i < eligibleVideos.length; i += checkBatchSize) {
      const batch = eligibleVideos.slice(i, i + checkBatchSize);
      const choicePromises = batch.map(async article => {
        const videoId = getYouTubeId(article.link);
        if (videoId) {
          try {
            const choices = await fetchAvailableCaptionChoices(videoId);
            if (choices.length > 0) {
              const transcript = await fetchAndParseTranscript(choices[0].url);
              if (transcript.length < 3) {
                skippedCount++;
                return null;
              }
              return { article, captionUrl: choices[0].url };
            }
          } catch (e) {
            console.warn(`Could not check transcripts for "${article.title}":`, e);
          }
        }
        return null;
      });

      const results = await Promise.all(choicePromises);
      articlesToSummarize.push(
        ...results.filter((r): r is { article: Article; captionUrl: string } => r !== null)
      );
      setSummaryGenerationProgress(((i + batch.length) / eligibleVideos.length) * 20);
    }

    if (articlesToSummarize.length === 0) {
      setToast({
        message:
          `None of the eligible videos in this view have transcripts available for summarization. ${skippedCount > 0 ? `${skippedCount} were skipped for having short transcripts.` : ''}`.trim(),
        type: 'error',
      });
      setIsGeneratingSummaries(false);
      setSummaryGenerationProgress(null);
      return;
    }

    setToast({
      message: `Found ${articlesToSummarize.length} videos with transcripts. Starting summarization...`,
      type: 'success',
    });

    let summarizedCount = 0;
    const totalToSummarize = articlesToSummarize.length;

    for (const { article, captionUrl } of articlesToSummarize) {
      try {
        const transcriptLines = await fetchAndParseTranscript(captionUrl);

        const { summary, sources } = await summarizeYouTubeVideo(
          article.title,
          transcriptLines,
          aiModel,
          defaultAiLanguage
        );

        handleSummaryGenerated(article.id, summary, sources);
        summarizedCount++;
      } catch (error) {
        console.error(`Failed to generate summary for "${article.title}":`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        if (!message.includes('too short')) {
          setToast({
            message: `Failed to summarize "${article.title}": ${message}`,
            type: 'error',
          });
        } else {
          skippedCount++;
        }
      } finally {
        const processedCount = summarizedCount + skippedCount;
        const baseProgress = 20;
        setSummaryGenerationProgress(baseProgress + (processedCount / totalToSummarize) * 80);
      }
    }

    let finalMessage = `Generated summaries for ${summarizedCount} of ${totalToSummarize} eligible videos.`;
    if (skippedCount > 0) {
      finalMessage += ` ${skippedCount} were skipped.`;
    }
    setToast({ message: finalMessage, type: 'success' });
    setIsGeneratingSummaries(false);
    setSummaryGenerationProgress(null);
  }, [articlesToShow, aiModel, defaultAiLanguage, handleSummaryGenerated, setToast]);

  const handleExecuteDetailedDigest = useCallback(
    async (selectedArticles: Article[], targetLanguage: string) => {
      setIsDigestConfigModalOpen(false);
      setInitialDigestLanguage(targetLanguage);

      if (selectedArticles.length === 0) {
        setToast({ message: 'No items were selected to create a digest from.', type: 'error' });
        return;
      }

      setIsDigestModalOpen(true);
      setDigestState({
        digest: null,
        type: 'detailed',
        error: null,
        isLoading: true,
        loadingMessage: `Summarizing ${selectedArticles.length} selected items...`,
      });

      try {
        const topItems = selectedArticles.slice(0, 10);

        const summaryPromises = topItems.map(
          async (article): Promise<DetailedDigestItem | null> => {
            if (article.structuredSummary) {
              return {
                title: article.title,
                link: article.link,
                summary: article.structuredSummary,
                sources: article.sources || [],
              };
            }
            if (article.summary) {
              return {
                title: article.title,
                link: article.link,
                summary: article.summary,
                sources: article.sources || [],
              };
            }

            if (article.isVideo && article.link) {
              const videoId = getYouTubeId(article.link);
              if (videoId) {
                try {
                  const choices = await fetchAvailableCaptionChoices(videoId);
                  if (choices.length > 0) {
                    const transcriptLines = await fetchAndParseTranscript(choices[0].url);
                    if (transcriptLines.length > 3) {
                      const { summary, sources } = await summarizeYouTubeVideo(
                        article.title,
                        transcriptLines,
                        aiModel,
                        defaultAiLanguage
                      );
                      return { title: article.title, link: article.link, summary, sources };
                    }
                  }
                  const textForSummary = `Title: ${article.title}\nDescription: ${(article.content || article.description).replace(/<[^>]*>?/gm, '').trim()}`;
                  const { summary, sources } = await summarizeText(
                    textForSummary,
                    article.link,
                    aiModel,
                    defaultAiLanguage,
                    'video'
                  );
                  return { title: article.title, link: article.link, summary, sources };
                } catch (e) {
                  console.warn(
                    `Could not get transcript for ${article.title}, falling back to text summary.`,
                    e
                  );
                  try {
                    const textForSummary = `Title: ${article.title}\nDescription: ${(article.content || article.description).replace(/<[^>]*>?/gm, '').trim()}`;
                    const { summary, sources } = await summarizeText(
                      textForSummary,
                      article.link,
                      aiModel,
                      defaultAiLanguage,
                      'video'
                    );
                    return { title: article.title, link: article.link, summary, sources };
                  } catch (fallbackError) {
                    console.error(
                      `Fallback summary also failed for ${article.title}:`,
                      fallbackError
                    );
                    return {
                      title: article.title,
                      link: article.link,
                      summary: `*Summary could not be generated for this item.*`,
                      sources: [],
                    };
                  }
                }
              }
            }
            return {
              title: article.title,
              link: article.link,
              summary: `*Summary could not be generated for this item.*`,
              sources: [],
            };
          }
        );

        const settledSummaries = await Promise.all(summaryPromises);
        const successfulSummaries = settledSummaries.filter(
          (s): s is DetailedDigestItem => s !== null
        );

        if (successfulSummaries.length === 0) {
          throw new Error('Failed to generate a summary for any of the selected items.');
        }

        const digest: DetailedDigest = successfulSummaries;

        setDigestState({
          digest,
          type: 'detailed',
          error: null,
          isLoading: false,
          loadingMessage: null,
        });
      } catch (e) {
        setDigestState({
          digest: null,
          type: 'detailed',
          error: e instanceof Error ? e.message : 'An unknown error occurred.',
          isLoading: false,
          loadingMessage: null,
        });
      }
    },
    [aiModel, setToast, setIsDigestConfigModalOpen, setIsDigestModalOpen, defaultAiLanguage]
  );

  const handleExecuteThematicDigest = useCallback(
    async (selectedArticles: Article[], targetLanguage: string) => {
      setIsDigestConfigModalOpen(false);
      setInitialDigestLanguage(targetLanguage);

      if (selectedArticles.length === 0) {
        setToast({ message: 'No items were selected to create a digest from.', type: 'error' });
        return;
      }

      setIsDigestModalOpen(true);
      setDigestState({
        digest: null,
        type: 'thematic',
        error: null,
        isLoading: true,
        loadingMessage: `Creating thematic digest for ${selectedArticles.length} items...`,
      });

      try {
        const digest = await generateThematicDigest(selectedArticles, aiModel as AiModel);
        setDigestState({
          digest,
          type: 'thematic',
          error: null,
          isLoading: false,
          loadingMessage: null,
        });
      } catch (e) {
        setDigestState({
          digest: null,
          type: 'thematic',
          error: e instanceof Error ? e.message : 'An unknown error occurred.',
          isLoading: false,
          loadingMessage: null,
        });
      }
    },
    [aiModel, setToast, setIsDigestConfigModalOpen, setIsDigestModalOpen]
  );

  const translateDigest = useCallback(
    async (
      digest: DetailedDigest | ThematicDigest,
      type: 'detailed' | 'thematic',
      targetLanguage: string
    ): Promise<DetailedDigest | ThematicDigest> => {
      if (type === 'detailed') {
        return await translateDetailedDigest(digest as DetailedDigest, targetLanguage, aiModel);
      } else {
        return await translateThematicDigest(digest as ThematicDigest, targetLanguage, aiModel);
      }
    },
    [aiModel]
  );

  const handleResetRecommendations = useCallback(() => {
    setRecommendationsState({ recommendations: null, error: null, isLoading: false });
  }, []);

  const handleGenerateRecommendations = useCallback(
    async (customQuery?: string) => {
      setRecommendationsState({ recommendations: null, error: null, isLoading: true });
      setIsRecommendationsModalOpen(true);
      try {
        const historyArticles = Array.from(readArticleIds.keys())
          .map(id => articlesById.get(id))
          .filter((a): a is Article => !!a);
        const { recommendations } = await generateRecommendations(
          feeds,
          historyArticles,
          aiModel,
          customQuery
        );
        setRecommendationsState({ recommendations, error: null, isLoading: false });
      } catch (e) {
        setRecommendationsState({
          recommendations: null,
          error: e instanceof Error ? e.message : 'An unknown error occurred.',
          isLoading: false,
        });
      }
    },
    [feeds, readArticleIds, articlesById, aiModel, setIsRecommendationsModalOpen]
  );

  const handleGenerateMoreRecommendations = useCallback(
    async (customQuery?: string) => {
      setRecommendationsState(prev => ({ ...prev, isLoading: true }));
      try {
        const historyArticles = Array.from(readArticleIds.keys())
          .map(id => articlesById.get(id))
          .filter((a): a is Article => !!a);
        const existingRecUrls = recommendationsState.recommendations?.map(rec => rec.url) || [];
        const { recommendations: newRecommendations } = await generateRecommendations(
          feeds,
          historyArticles,
          aiModel,
          customQuery,
          existingRecUrls
        );

        setRecommendationsState(prev => {
          const existingRecs = prev.recommendations || [];
          const combined = [...existingRecs, ...newRecommendations];
          const uniqueRecs = Array.from(new Map(combined.map(item => [item.url, item])).values());
          return { recommendations: uniqueRecs, error: null, isLoading: false };
        });
      } catch (e) {
        setRecommendationsState(prev => ({
          ...prev,
          error: e instanceof Error ? e.message : 'An unknown error occurred.',
          isLoading: false,
        }));
      }
    },
    [feeds, readArticleIds, articlesById, aiModel, recommendationsState.recommendations]
  );

  const handleExportFeeds = useCallback(
    (options: { favoritesOnly?: boolean; tag?: string }) => {
      let feedsToExport: Feed[];
      let fileName = 'media-feeder-backup';

      if (options.favoritesOnly) {
        feedsToExport = favoriteFeeds;
        fileName = 'media-feeder-favorites-backup';
      } else if (options.tag) {
        feedsToExport = feedsByTag.get(options.tag) || [];
        fileName = `media-feeder-tag-${options.tag}-backup`;
      } else {
        feedsToExport = feeds;
      }

      const articlesByFeedUrl: Record<string, Article[]> = {};
      const feedsForJson = feedsToExport.map(feed => {
        const { id, items, error, ...rest } = feed;
        articlesByFeedUrl[feed.url] = items.map(item => {
          const { sources, ...restItem } = item;
          return restItem as Article;
        });
        return rest;
      });

      const data: SyncData = {
        feeds: feedsForJson,
        articlesByFeedUrl,
        readLaterArticleIds: Array.from(readLaterArticleIds),
        gridZoomLevel,
        articleZoomLevel,
        autoplayMode,
        articleTags: Array.from(articleTags.entries()),
        readLaterOrderYt,
        readLaterOrderRss,
        tagOrders,
        favoritesOrderYt,
        favoritesOrderRss,
        notes,
        noteFolders,
        highlights,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().split('T')[0];
      a.download = `${fileName}_${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ message: 'Backup file has been created.', type: 'success' });
      setIsExportModalOpen(false);
    },
    [
      feeds,
      favoriteFeeds,
      readLaterArticleIds,
      gridZoomLevel,
      articleZoomLevel,
      autoplayMode,
      articleTags,
      feedsByTag,
      readLaterOrderYt,
      readLaterOrderRss,
      tagOrders,
      favoritesOrderYt,
      favoritesOrderRss,
      setToast,
      setIsExportModalOpen,
      notes,
      noteFolders,
    ]
  );

  const handleExportChannelsAsText = useCallback(() => {
    const textData = feeds.map(({ id, items, error, ...rest }) => rest);
    const jsonString = JSON.stringify(textData, null, 2);
    setExportTextContent(jsonString);
    setIsExportTextModalOpen(true);
  }, [feeds, setExportTextContent, setIsExportTextModalOpen]);

  const handleOpenClearDataModal = useCallback(() => setIsClearDataModalOpen(true), []);

  const handleClearArticles = useCallback(
    (options: { clearYT: boolean; clearNonYT: boolean; keepReadLater: boolean }) => {
      const { clearYT, clearNonYT, keepReadLater } = options;

      let target = '';
      if (clearYT && !clearNonYT) target = 'YouTube';
      else if (!clearYT && clearNonYT) target = 'Non-YouTube';
      else return;

      const confirmMessage = `Are you sure you want to delete all ${target} articles and their reading history? ${keepReadLater ? "Articles saved to 'Read Later' will be kept." : "This includes articles saved to 'Read Later'."} This cannot be undone.`;

      if (window.confirm(confirmMessage)) {
        const articleIdsToDelete = new Set<string>();
        feeds.forEach(feed => {
          const shouldClearThisFeed =
            (clearYT && isYouTubeFeed(feed)) || (clearNonYT && !isYouTubeFeed(feed));
          if (shouldClearThisFeed) {
            feed.items.forEach(item => {
              if (!keepReadLater || !readLaterArticleIds.has(item.id)) {
                articleIdsToDelete.add(item.id);
              }
            });
          }
        });

        setFeeds(prevFeeds =>
          prevFeeds.map(feed => {
            const shouldClearThisFeed =
              (clearYT && isYouTubeFeed(feed)) || (clearNonYT && !isYouTubeFeed(feed));
            if (shouldClearThisFeed) {
              return {
                ...feed,
                items: feed.items.filter(item => !articleIdsToDelete.has(item.id)),
              };
            }
            return feed;
          })
        );

        setReadArticleIds(prev => {
          const newMap = new Map(prev);
          articleIdsToDelete.forEach(id => newMap.delete(id));
          return newMap;
        });

        setArticleTags(prev => {
          const newMap = new Map(prev);
          articleIdsToDelete.forEach(id => newMap.delete(id));
          return newMap;
        });

        setToast({ message: `${target} articles and history have been cleared.`, type: 'success' });
      }
    },
    [feeds, readLaterArticleIds, setToast]
  );

  const handleFactoryReset = useCallback(() => {
    if (
      window.confirm(
        'Are you sure you want to factory reset the app? This will delete ALL your subscriptions, articles, tags, and settings. This is irreversible.'
      )
    ) {
      localStorage.clear();
      window.location.reload();
    }
  }, []);

  const handleClearHistory = useCallback(() => {
    if (window.confirm('Are you sure you want to clear your entire reading history?')) {
      setReadArticleIds(new Map());
      setToast({ message: 'Reading history cleared.', type: 'success' });
    }
  }, [setToast]);

  const handleClearReadLater = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all articles from your Read Later list?')) {
      setReadLaterArticleIds(new Set());
      setToast({ message: 'Read Later list cleared.', type: 'success' });
    }
  }, [setToast]);

  const handleMarkAllInAllFeedsAsRead = useCallback(() => {
    if (window.confirm('Are you sure you want to mark ALL articles in ALL feeds as read?')) {
      setReadArticleIds(prev => {
        const newMap = new Map(prev);
        allArticles.forEach(article => {
          if (!newMap.has(article.id)) newMap.set(article.id, Date.now());
        });
        return newMap;
      });
      setToast({ message: 'All articles marked as read.', type: 'success' });
    }
  }, [allArticles, setToast]);

  const handleMarkAllRead = useCallback(() => {
    if (articlesToShow.length === 0) return;
    if (
      window.confirm(
        `Are you sure you want to mark all ${articlesToShow.length} articles in this view as read?`
      )
    ) {
      setReadArticleIds(prev => {
        const newMap = new Map(prev);
        articlesToShow.forEach(article => {
          if (!newMap.has(article.id)) newMap.set(article.id, Date.now());
        });
        return newMap;
      });
      setToast({ message: 'All visible articles marked as read.', type: 'success' });
    }
  }, [articlesToShow, setToast]);

  const handleMarkSelectedAsRead = useCallback(() => {
    if (selectedArticleIdsForBatch.size === 0) return;
    setReadArticleIds(prev => {
      const newMap = new Map(prev);
      selectedArticleIdsForBatch.forEach(id => newMap.set(id, Date.now()));
      return newMap;
    });
    setToast({
      message: `Marked ${selectedArticleIdsForBatch.size} articles as read.`,
      type: 'success',
    });
    setSelectedArticleIdsForBatch(new Set());
  }, [selectedArticleIdsForBatch, setToast]);

  const handleRemoveArticle = useCallback(
    (articleId: string, feedId: string) => {
      if (!window.confirm('Are you sure you want to remove this article? This cannot be undone.'))
        return;

      setFeeds(prevFeeds => {
        return prevFeeds.map(feed => {
          if (feed.id === feedId) {
            return {
              ...feed,
              items: feed.items.filter(item => item.id !== articleId),
            };
          }
          return feed;
        });
      });

      setReadArticleIds(prev => {
        const newMap = new Map(prev);
        newMap.delete(articleId);
        return newMap;
      });
      setReadLaterArticleIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(articleId);
        return newSet;
      });
      setArticleTags(prev => {
        const newMap = new Map(prev);
        newMap.delete(articleId);
        return newMap;
      });

      if (selectedArticle?.id === articleId) {
        handleCloseArticleModal();
      }

      setToast({ message: 'Article removed.', type: 'success' });
    },
    [selectedArticle, handleCloseArticleModal, setToast]
  );

  const handleBulkDeleteArticles = useCallback(() => {
    if (selectedArticleIdsForBatch.size === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedArticleIdsForBatch.size} selected articles? This cannot be undone.`
      )
    )
      return;

    const idsToDelete = selectedArticleIdsForBatch;

    setFeeds(prevFeeds =>
      prevFeeds.map(feed => ({
        ...feed,
        items: feed.items.filter(item => !idsToDelete.has(item.id)),
      }))
    );

    setReadArticleIds(prev => {
      const newMap = new Map(prev);
      idsToDelete.forEach(id => newMap.delete(id));
      return newMap;
    });
    setReadLaterArticleIds(prev => {
      const newSet = new Set(prev);
      idsToDelete.forEach(id => newSet.delete(id));
      return newSet;
    });
    setArticleTags(prev => {
      const newMap = new Map(prev);
      idsToDelete.forEach(id => newMap.delete(id));
      return newMap;
    });

    setSelectedArticleIdsForBatch(new Set());
    setToast({ message: `Deleted ${idsToDelete.size} articles.`, type: 'success' });
  }, [selectedArticleIdsForBatch, setToast]);

  const handleReorderArticles = useCallback(
    (view: { type: string; value?: any }, sourceId: string, targetId: string | null) => {
      const updateOrder = (currentOrder: string[], setOrder: (order: string[]) => void) => {
        const newOrder = [...currentOrder];
        const sourceIndex = newOrder.indexOf(sourceId);
        if (sourceIndex > -1) newOrder.splice(sourceIndex, 1);

        if (targetId === null) {
          newOrder.push(sourceId);
        } else {
          const targetIndex = newOrder.indexOf(targetId);
          if (targetIndex > -1) newOrder.splice(targetIndex, 0, sourceId);
          else newOrder.unshift(sourceId); // Fallback if target not found
        }
        setOrder(newOrder);
      };

      if (view.type === 'readLater') {
        const source = view.value || 'yt';
        if (source === 'yt') updateOrder(readLaterOrderYt, setReadLaterOrderYt);
        else updateOrder(readLaterOrderRss, setReadLaterOrderRss);
      } else if (view.type === 'favorites') {
        const source = view.value || 'yt';
        if (source === 'yt') updateOrder(favoritesOrderYt, setFavoritesOrderYt);
        else updateOrder(favoritesOrderRss, setFavoritesOrderRss);
      } else if (view.type === 'tag') {
        const tagValue = view.value;
        let tagKey: string | undefined;
        if (typeof tagValue === 'object' && tagValue.name && tagValue.type) {
          tagKey = `${tagValue.type}-${tagValue.name}`;
        } else if (typeof tagValue === 'string') {
          tagKey = tagValue;
        }
        if (tagKey) {
          setTagOrders(prev => ({
            ...prev,
            [tagKey!]: (currentOrder => {
              const newOrder = [...(currentOrder || [])];
              const sourceIndex = newOrder.indexOf(sourceId);
              if (sourceIndex > -1) newOrder.splice(sourceIndex, 1);
              if (targetId === null) newOrder.push(sourceId);
              else {
                const targetIndex = newOrder.indexOf(targetId);
                if (targetIndex > -1) newOrder.splice(targetIndex, 0, sourceId);
                else newOrder.unshift(sourceId);
              }
              return newOrder;
            })(prev[tagKey!]),
          }));
        }
      }
    },
    [readLaterOrderYt, readLaterOrderRss, favoritesOrderYt, favoritesOrderRss, tagOrders]
  );

  const handleOpenRelatedModal = useCallback((feedId: string) => {
    setRelatedSourceFeedId(feedId);
    setIsRelatedModalOpen(true);
  }, []);

  const handleCloseRelatedModal = useCallback(() => {
    setIsRelatedModalOpen(false);
    setRelatedSourceFeedId(null);
    setRelatedChannelsState({ recommendations: null, error: null, isLoading: false });
  }, []);

  const handleGenerateRelated = useCallback(async () => {
    if (!relatedSourceFeedId) return;
    const sourceFeed = feeds.find(f => f.id === relatedSourceFeedId);
    if (!sourceFeed) return;
    setRelatedChannelsState({ recommendations: null, error: null, isLoading: true });
    try {
      const existingUrls = feeds.map(f => f.url);
      const { recommendations } = await generateRelatedChannels(sourceFeed, existingUrls, aiModel);
      setRelatedChannelsState({ recommendations, error: null, isLoading: false });
    } catch (e) {
      setRelatedChannelsState({
        recommendations: null,
        error: e instanceof Error ? e.message : 'An unknown error occurred.',
        isLoading: false,
      });
    }
  }, [relatedSourceFeedId, feeds, aiModel]);

  const handleBulkUpdateTags = useCallback(
    (feedIds: Set<string>, tags: string[], mode: 'add' | 'set' | 'favorite') => {
      setFeeds(prevFeeds =>
        prevFeeds.map(feed => {
          if (!feedIds.has(feed.id)) return feed;
          if (mode === 'favorite') {
            return { ...feed, isFavorite: true };
          }
          const currentTags = new Set(feed.tags || []);
          const tagsToApply = new Set(tags);
          let newTags: Set<string>;
          if (mode === 'add') {
            newTags = new Set([...currentTags, ...tagsToApply]);
          } else {
            // 'set'
            newTags = tagsToApply;
          }
          const sortedTags = Array.from(newTags).sort();
          return { ...feed, tags: sortedTags.length > 0 ? sortedTags : undefined };
        })
      );
      setToast({ message: `${feedIds.size} feeds updated successfully.`, type: 'success' });
    },
    [setToast]
  );

  const handleOpenBulkEdit = useCallback(() => {
    setBulkEditModalConfig({ isOpen: true, mode: 'add' });
  }, []);

  const handleOpenBulkEditForTag = useCallback((tag: string) => {
    setBulkEditModalConfig({ isOpen: true, mode: 'add', tag });
  }, []);

  const handleOpenBulkEditForFavorites = useCallback(() => {
    setBulkEditModalConfig({ isOpen: true, mode: 'favorite' });
  }, []);

  const onToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);
  const onToggleViewsCollapse = useCallback(() => setIsViewsCollapsed(prev => !prev), []);
  const onToggleYoutubeFeedsCollapse = useCallback(
    () => setIsYoutubeFeedsCollapsed(prev => !prev),
    []
  );
  const onToggleRssFeedsCollapse = useCallback(() => setIsRssFeedsCollapse(prev => !prev), []);
  const onToggleRedditFeedsCollapse = useCallback(
    () => setIsRedditFeedsCollapse(prev => !prev),
    []
  );
  const onToggleTagsCollapse = useCallback(() => setIsTagsCollapsed(prev => !prev), []);
  const onToggleYoutubeTagsCollapse = useCallback(
    () => setIsYoutubeTagsCollapsed(prev => !prev),
    []
  );
  const onToggleRssTagsCollapse = useCallback(() => setIsRssTagsCollapsed(prev => !prev), []);
  const onToggleNotesCollapse = useCallback(() => setIsNotesCollapsed(prev => !prev), []);
  const onToggleAiTopicsCollapse = useCallback(() => setIsAiTopicsCollapsed(prev => !prev), []);

  const onToggleTagExpansion = useCallback((tag: string, tagType: 'youtube' | 'rss') => {
    const compositeKey = `${tagType}-${tag}`;
    setExpandedTags(prev => {
      const newSet = new Set(prev);
      if (newSet.has(compositeKey)) newSet.delete(compositeKey);
      else newSet.add(compositeKey);
      return newSet;
    });
  }, []);

  const onToggleViewExpansion = useCallback(
    (viewType: 'published-today' | 'readLater' | 'history') => {
      setExpandedViews(prev => {
        const newSet = new Set(prev);
        if (newSet.has(viewType)) newSet.delete(viewType);
        else newSet.add(viewType);
        return newSet;
      });
    },
    []
  );

  const onToggleYoutubePlaylistsCollapse = useCallback(
    () => setIsYoutubePlaylistsCollapsed(prev => !prev),
    []
  );

  const handleZoomIn = useCallback(() => {
    setGridZoomLevel(prev => {
      const currentIndex = ZOOM_LEVELS.indexOf(prev);
      return currentIndex > 0 ? ZOOM_LEVELS[currentIndex - 1] : prev;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setGridZoomLevel(prev => {
      const currentIndex = ZOOM_LEVELS.indexOf(prev);
      return currentIndex < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[currentIndex + 1] : prev;
    });
  }, []);

  const handleArticleZoomIn = useCallback(() => {
    setArticleZoomLevel(prev => {
      const currentIndex = ZOOM_LEVELS.indexOf(prev);
      return currentIndex > 0 ? ZOOM_LEVELS[currentIndex - 1] : prev;
    });
  }, []);

  const handleArticleZoomOut = useCallback(() => {
    setArticleZoomLevel(prev => {
      const currentIndex = ZOOM_LEVELS.indexOf(prev);
      return currentIndex < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[currentIndex + 1] : prev;
    });
  }, []);

  const handleClearArticlesCache = useCallback(() => {
    localStorage.removeItem(ARTICLES_CACHE_KEY);
    setToast({ message: 'Articles cache cleared.', type: 'success' });
  }, [setToast]);

  const handleClearAllTags = useCallback(() => {
    if (
      window.confirm(
        'Are you sure you want to remove all tags from all feeds? This cannot be undone.'
      )
    ) {
      setFeeds(prevFeeds => prevFeeds.map(feed => ({ ...feed, tags: undefined })));
      setArticleTags(new Map());
      setToast({ message: 'All tags have been cleared from all feeds.', type: 'success' });
    }
  }, [setToast]);

  const handleToggleAutoplayNext = useCallback(
    () => setAutoplayMode(prev => (prev === 'on' ? 'off' : 'on')),
    []
  );
  const handleToggleAutoplayRandom = useCallback(
    () => setAutoplayMode(prev => (prev === 'random' ? 'off' : 'random')),
    []
  );
  const handleToggleAutoplayRepeat = useCallback(
    () => setAutoplayMode(prev => (prev === 'repeat' ? 'off' : 'repeat')),
    []
  );
  const handleToggleAutoLikeYouTubeVideos = useCallback(
    () => setAutoLikeYouTubeVideos(prev => !prev),
    []
  );

  const handleAddPersonalInterest = useCallback((topic: string) => {
    const trimmed = topic.trim();
    if (!trimmed) return;

    setPersonalInterests(prev => {
      if (prev.includes(trimmed)) return prev; // No duplicate
      if (prev.length >= 10) {
        console.warn('[Personal Interests] Maximum of 10 topics reached');
        return prev;
      }
      return [...prev, trimmed];
    });
  }, []);

  const handleRemovePersonalInterest = useCallback((topic: string) => {
    setPersonalInterests(prev => prev.filter(t => t !== topic));
  }, []);
  const handleToggleAutoUploadAfterRefresh = useCallback(
    () => setAutoUploadAfterRefresh(prev => !prev),
    []
  );
  const handleToggleAutoSummarizeOnRefresh = useCallback(
    () => setAutoSummarizeOnRefresh(prev => !prev),
    []
  );

  const handleToggleAutoClusterOnRefresh = useCallback(
    () => setAutoClusterOnRefresh(prev => !prev),
    []
  );
  const handleToggleRssAndReddit = useCallback(() => setEnableRssAndReddit(prev => !prev), []);
  const handleImportBundledChannels = useCallback(
    (feedsToImport: Omit<Feed, 'id' | 'items' | 'error'>[]) => {
      const existingUrls = new Set(feeds.map(f => f.url));
      const newFeeds: Feed[] = feedsToImport
        .filter(feedData => !existingUrls.has(feedData.url))
        .map(feedData => ({
          ...feedData,
          id: feedData.url,
          items: [],
          error: null,
        }));

      if (newFeeds.length > 0) {
        setFeeds(prev => [...prev, ...newFeeds]);
        setToast({
          message: `Successfully added ${newFeeds.length} new feeds. Refreshing them now...`,
          type: 'success',
        });
        batchRefreshHandler(newFeeds, `${newFeeds.length} new feeds`);
      } else {
        setToast({
          message: 'All channels from the bundle are already in your subscriptions.',
          type: 'success',
        });
      }
    },
    [feeds, setToast, batchRefreshHandler]
  );

  const handleFetchYouTubeSubscriptions = useCallback(async () => {
    if (!accessToken) {
      setToast({ message: 'Please sign in to Google to import subscriptions.', type: 'error' });
      handleGoogleSignIn({ showConsentPrompt: true });
      return;
    }
    setYouTubeImportState({ status: 'loading', subscriptions: [], error: null });
    try {
      const subs = await fetchYouTubeSubscriptions(accessToken);
      setYouTubeImportState({ status: 'loaded', subscriptions: subs, error: null });
    } catch (e: any) {
      setYouTubeImportState({ status: 'error', subscriptions: [], error: e.message });
      if (e.isAuthError) handleGoogleSignIn({ showConsentPrompt: true });
    }
  }, [accessToken, setToast, handleGoogleSignIn]);

  const handleClearYouTubeImportState = useCallback(() => {
    setYouTubeImportState({ status: 'idle', subscriptions: [], error: null });
  }, []);

  const handleAddYouTubeChannels = useCallback(
    async (subscriptions: YouTubeSubscription[]) => {
      if (subscriptions.length === 0) return;

      const newFeedsData = subscriptions.map(
        (sub): Omit<Feed, 'id' | 'items' | 'error'> => ({
          url: `https://www.youtube.com/channel/${sub.channelId}/home`,
          title: sub.title,
          description: sub.description,
          iconUrl: sub.thumbnailUrl,
          maxArticles: 5,
        })
      );

      handleImportBundledChannels(newFeedsData);
      setIsImportYouTubeModalOpen(false);
    },
    [handleImportBundledChannels, setIsImportYouTubeModalOpen]
  );

  const handleToggleArticleSelection = useCallback((articleId: string) => {
    setSelectedArticleIdsForBatch(prev => {
      const newSet = new Set(prev);
      if (newSet.has(articleId)) newSet.delete(articleId);
      else newSet.add(articleId);
      return newSet;
    });
  }, []);

  const handleSelectAllArticles = useCallback(() => {
    const allVisibleIds = new Set(articlesToShow.map(a => a.id));
    const areAllSelected =
      allVisibleIds.size > 0 &&
      Array.from(allVisibleIds).every(id => selectedArticleIdsForBatch.has(id));

    if (areAllSelected) {
      // If all are selected, deselect them
      setSelectedArticleIdsForBatch(prev => {
        const newSet = new Set(prev);
        allVisibleIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // If not all are selected (or none are), select all of them
      setSelectedArticleIdsForBatch(prev => new Set([...prev, ...allVisibleIds]));
    }
  }, [articlesToShow, selectedArticleIdsForBatch]);

  const handleClearArticleSelection = useCallback(() => {
    setSelectedArticleIdsForBatch(new Set());
  }, []);

  const handleSaveArticleTags = useCallback((articleId: string, tags: string[]) => {
    setArticleTags(prev => {
      const newMap = new Map(prev);
      if (tags.length > 0) newMap.set(articleId, tags);
      else newMap.delete(articleId);
      return newMap;
    });
  }, []);

  const handleBulkSaveArticleTags = useCallback(
    (articleIds: Set<string>, tags: string[], mode: 'add' | 'set') => {
      setArticleTags(prev => {
        const newMap = new Map(prev);
        articleIds.forEach(id => {
          const currentTags = new Set(newMap.get(id) || []);
          const tagsToApply = new Set(tags);
          let newTags: Set<string>;
          if (mode === 'add') newTags = new Set([...currentTags, ...tagsToApply]);
          else newTags = tagsToApply;

          const sortedTags = Array.from(newTags).sort();
          if (sortedTags.length > 0) newMap.set(id, sortedTags);
          else newMap.delete(id);
        });
        return newMap;
      });
      setToast({ message: `${articleIds.size} articles updated.`, type: 'success' });
    },
    [setToast]
  );

  const handleBulkClearArticleTags = useCallback(() => {
    if (
      window.confirm(
        `Are you sure you want to remove all tags from the ${selectedArticleIdsForBatch.size} selected articles?`
      )
    ) {
      setArticleTags(prev => {
        const newMap = new Map(prev);
        selectedArticleIdsForBatch.forEach(id => newMap.delete(id));
        return newMap;
      });
      setToast({ message: 'Tags cleared from selected articles.', type: 'success' });
    }
  }, [selectedArticleIdsForBatch, setToast]);

  const startDemo = useCallback(() => {
    setIsDemoMode(true);
    setDemoStep(0);
  }, []);

  const endDemo = useCallback(() => {
    setIsDemoMode(false);
  }, []);

  const handleDemoNext = useCallback(() => {
    setDemoStep(prev => prev + 1);
    if (demoStep === 0) {
      handleViewChange('all-subscriptions');
    } else if (demoStep === 1) {
      handleSelectFeed(feeds[0]?.id || '');
    } else if (demoStep === 6) {
      endDemo();
    }
  }, [demoStep, handleViewChange, handleSelectFeed, endDemo, feeds]);

  const handleOpenNoteEditor = useCallback(
    (
      note?: Note,
      initialContent?: {
        title: string;
        content: string;
        sourceArticleIds: { feedId: string; articleId: string }[];
      }
    ) => {
      setNoteToEdit(note || null);
      setInitialNoteContent(initialContent || null);
      setIsNoteEditorModalOpen(true);
    },
    []
  );

  const handleCloseNoteEditor = useCallback(() => {
    setIsNoteEditorModalOpen(false);
    setNoteToEdit(null);
    setInitialNoteContent(null);
  }, []);

  const handleSaveNote = useCallback(
    async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<Note> => {
      let savedNote: Note;
      if (id) {
        savedNote = {} as Note; // Placeholder, will be replaced in setNotes
        setNotes(prev =>
          prev.map(n => {
            if (n.id === id) {
              savedNote = { ...n, ...noteData, updatedAt: Date.now() };
              return savedNote;
            }
            return n;
          })
        );
      } else {
        const now = Date.now();
        savedNote = { ...noteData, id: `note-${now}`, createdAt: now, updatedAt: now };
        setNotes(prev => [...prev, savedNote]);
      }
      if (!savedNote.id) {
        // This case handles when an existing note is saved but not found in state, though unlikely.
        // Or if the `setNotes` update hasn't completed. We return a promise that resolves
        // with a best-effort `savedNote`. The primary purpose of the return value is for new notes.
        return new Promise(resolve => setTimeout(() => resolve(savedNote), 0));
      }
      return savedNote;
    },
    []
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      if (window.confirm('Are you sure you want to delete this note?')) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
        setToast({ message: 'Note deleted.', type: 'success' });
      }
    },
    [setToast]
  );

  const handleAddNoteFolder = useCallback(async (name: string): Promise<NoteFolder> => {
    const now = Date.now();
    const newFolder: NoteFolder = { id: `folder-${now}`, name, createdAt: now };
    setNoteFolders(prev => [...prev, newFolder].sort((a, b) => a.name.localeCompare(b.name)));
    return newFolder;
  }, []);

  const handleDeleteNoteFolder = useCallback(
    (folderId: string) => {
      if (
        window.confirm(
          "Are you sure you want to delete this folder? Notes inside won't be deleted but will become uncategorized."
        )
      ) {
        setNoteFolders(prev => prev.filter(f => f.id !== folderId));
        setNotes(prev => prev.map(n => (n.folderId === folderId ? { ...n, folderId: '' } : n)));
        setToast({ message: 'Folder deleted.', type: 'success' });
      }
    },
    [setToast]
  );

  const handleSaveSummaryAsNote = useCallback(
    async (article: Article) => {
      if (!article.summary && !article.structuredSummary) {
        setToast({ message: 'No AI summary available to save.', type: 'error' });
        return;
      }

      let summaryContent = '';
      if (article.structuredSummary) {
        summaryContent += `## AI Summary\n${article.structuredSummary.overallSummary}\n\n`;
        if (article.structuredSummary.sections.length > 0) {
          summaryContent += `### Key Moments\n`;
          article.structuredSummary.sections.forEach(section => {
            const timestamp = article.link
              ? `[${formatTranscriptTime(section.timestamp)}](${article.link}&t=${Math.floor(section.timestamp)}s)`
              : `*${formatTranscriptTime(section.timestamp)}*`;
            summaryContent += `- **${timestamp} - ${section.title}**: ${section.summary}\n`;
          });
        }
      } else if (article.summary) {
        summaryContent += `## AI Summary\n${article.summary}`;
      }

      if (article.link) {
        summaryContent += `\n\n---\n\n**Original Source:** [${article.title}](${article.link})`;
      }

      handleOpenNoteEditor(undefined, {
        title: `Note for: ${article.title}`,
        content: summaryContent,
        sourceArticleIds: [{ feedId: article.feedId, articleId: article.id }],
      });
    },
    [handleOpenNoteEditor, setToast]
  );

  const handleSaveDigestAsNote = useCallback(
    (digest: DetailedDigest | ThematicDigest, articles: Article[]) => {
      let noteTitle = '';
      let noteContent = '';
      const sourceIds = articles.map(a => ({ feedId: a.feedId, articleId: a.id }));

      if (Array.isArray(digest)) {
        // DetailedDigest
        noteTitle = `Detailed Digest of ${articles.length} items`;
        digest.forEach(item => {
          noteContent += `## [${item.title}](${item.link})\n\n`;
          if (typeof item.summary === 'string') {
            noteContent += `${item.summary}\n\n`;
          } else {
            noteContent += `### Overall Summary\n${item.summary.overallSummary}\n\n`;
            if (item.summary.sections && item.summary.sections.length > 0) {
              noteContent += `### Key Moments\n`;
              noteContent +=
                item.summary.sections
                  .map(
                    section =>
                      `- **[${formatTranscriptTime(section.timestamp)}](${item.link}&t=${Math.floor(section.timestamp)}s) - ${section.title}**: ${section.summary}`
                  )
                  .join('\n') + '\n\n';
            }
          }
          if (item.sources && item.sources.length > 0) {
            noteContent += `**Sources:**\n`;
            noteContent +=
              item.sources
                .map(source => `- [${source.title || source.uri}](${source.uri})`)
                .join('\n') + '\n\n';
          }
          noteContent += '---\n\n';
        });
      } else {
        // ThematicDigest
        noteTitle = digest.digestTitle;
        digest.themedGroups.forEach(group => {
          noteContent += `## ${group.themeTitle}\n\n${group.themeSummary}\n\n`;
          if (group.keywords && group.keywords.length > 0) {
            noteContent += `**Keywords:** ${group.keywords.join(', ')}\n\n`;
          }
          noteContent += `**Related Articles:**\n`;
          noteContent +=
            group.articles.map(article => `- [${article.title}](${article.link})`).join('\n') +
            '\n\n';
          noteContent += '---\n\n';
        });
      }

      handleOpenNoteEditor(undefined, {
        title: noteTitle,
        content: noteContent,
        sourceArticleIds: sourceIds,
      });
    },
    [handleOpenNoteEditor]
  );

  const generateMarkdownForMultipleArticles = useCallback(
    async (articlesToProcess: Article[]): Promise<string> => {
      const markdownPromises = articlesToProcess.map(generateArticleMarkdown);
      const markdowns = await Promise.all(markdownPromises);
      return markdowns.join('\n---\n\n');
    },
    []
  );

  const handleSaveViewAsNote = useCallback(async () => {
    if (articlesToShow.length === 0) {
      setToast({ message: 'No articles in the current view to save.', type: 'error' });
      return;
    }
    setIsSavingViewAsNote(true);
    try {
      const content = await generateMarkdownForMultipleArticles(articlesToShow);
      handleOpenNoteEditor(undefined, {
        title: `Note for view: ${headerTitle}`,
        content: content,
        sourceArticleIds: articlesToShow.map(a => ({ feedId: a.feedId, articleId: a.id })),
      });
    } catch (e) {
      setToast({
        message: `Failed to save view as note: ${e instanceof Error ? e.message : 'Unknown error'}`,
        type: 'error',
      });
    } finally {
      setIsSavingViewAsNote(false);
    }
  }, [
    articlesToShow,
    headerTitle,
    generateMarkdownForMultipleArticles,
    handleOpenNoteEditor,
    setToast,
  ]);

  const handleSaveSelectionAsNote = useCallback(async () => {
    if (selectedArticleIdsForBatch.size === 0) {
      setToast({ message: 'No articles selected to save.', type: 'error' });
      return;
    }
    setIsSavingSelectionAsNote(true);
    try {
      const selectedArticles = Array.from(selectedArticleIdsForBatch)
        .map(id => articlesById.get(id))
        .filter((a): a is Article => !!a);

      const content = await generateMarkdownForMultipleArticles(selectedArticles);
      handleOpenNoteEditor(undefined, {
        title: `Note for selection of ${selectedArticles.length} articles`,
        content: content,
        sourceArticleIds: selectedArticles.map(a => ({ feedId: a.feedId, articleId: a.id })),
      });
    } catch (e) {
      setToast({
        message: `Failed to save selection as note: ${e instanceof Error ? e.message : 'Unknown error'}`,
        type: 'error',
      });
    } finally {
      setIsSavingSelectionAsNote(false);
    }
  }, [
    selectedArticleIdsForBatch,
    articlesById,
    generateMarkdownForMultipleArticles,
    handleOpenNoteEditor,
    setToast,
  ]);

  const handleConfirmGenerateEbook = useCallback(
    async (title: string, filename: string) => {
      const source = epubDefaults?.source;
      if (source === 'selection') setIsGeneratingEbook(true);
      else if (source === 'view') setIsGeneratingEbookFromView(true);
      else return;

      setIsEpubSettingsModalOpen(false);
      setToast({
        message: `Generating EPUB "${filename}.epub"... This may take a while.`,
        type: 'success',
      });
      try {
        const blob = await createEpub(articlesForEpub, title);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.epub`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setToast({ message: `EPUB "${filename}.epub" has been created.`, type: 'success' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred.';
        setToast({ message: `Failed to create EPUB: ${message}`, type: 'error' });
      } finally {
        setIsGeneratingEbook(false);
        setIsGeneratingEbookFromView(false);
        setArticlesForEpub([]);
        setEpubDefaults(null);
      }
    },
    [articlesForEpub, epubDefaults, setToast, setIsEpubSettingsModalOpen]
  );

  // --- Highlight handlers ---
  const handleAddHighlight = useCallback(
    (highlight: Omit<Highlight, 'id' | 'createdAt'>) => {
      const newHighlight: Highlight = {
        ...highlight,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      setHighlights(prev => [...prev, newHighlight]);
    },
    []
  );

  const handleRemoveHighlight = useCallback((id: string) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
  }, []);

  const handleUpdateHighlightNote = useCallback((id: string, note: string) => {
    setHighlights(prev => prev.map(h => (h.id === id ? { ...h, note } : h)));
  }, []);

  const handleOpenRefreshOptionsModal = useCallback(
    (initialState?: { favoritesOnly?: boolean }) => {
      setRefreshModalInitialState(initialState || null);
      setIsRefreshOptionsModalOpen(true);
    },
    []
  );

  const handleSuccessfulApiCall = useCallback(() => {
    if (isAiDisabled) {
      setIsAiDisabled(false);
    }
  }, [isAiDisabled, setIsAiDisabled]);

  // --- Consolidated Persistence Effect (debounced) ---
  // Replaces 46 individual useEffect writers with a single debounced batch writer.
  // Reduces localStorage write amplification during batch refreshes.
  useEffect(() => {
    const timer = setTimeout(() => {
      // UI state
      safeSetLocalStorage(FEEDS_STORAGE_KEY, feeds);
      if (!isMobileView) safeSetLocalStorage(SIDEBAR_COLLAPSED_KEY, isSidebarCollapsed);
      safeSetLocalStorage(SIDEBAR_TAB_KEY, sidebarTab);
      safeSetLocalStorage(SIDEBAR_FEEDS_VIEW_KEY, sidebarFeedsView);
      safeSetLocalStorage(GRID_ZOOM_LEVEL_KEY, gridZoomLevel);
      safeSetLocalStorage(ARTICLE_ZOOM_LEVEL_KEY, articleZoomLevel);
      safeSetLocalStorage(ARTICLE_VIEW_MODE_KEY, articleViewMode);
      safeSetLocalStorage(HAS_ENTERED_KEY, hasEnteredApp);

      // Article/bookmark state
      safeSetLocalStorage(READ_ARTICLES_KEY, readArticleIds);
      safeSetLocalStorage(READ_LATER_KEY, readLaterArticleIds);
      safeSetLocalStorage(LIKED_YOUTUBE_VIDEOS_KEY, likedVideoIds);
      safeSetLocalStorage(ARTICLE_TAGS_KEY, articleTags);
      safeSetLocalStorage(READ_LATER_ORDER_YT_KEY, readLaterOrderYt);
      safeSetLocalStorage(READ_LATER_ORDER_RSS_KEY, readLaterOrderRss);
      safeSetLocalStorage(FAVORITES_ORDER_YT_KEY, favoritesOrderYt);
      safeSetLocalStorage(FAVORITES_ORDER_RSS_KEY, favoritesOrderRss);
      safeSetLocalStorage(TAG_ORDERS_KEY, tagOrders);
      safeSetLocalStorage(RECENT_SHARE_CODES_KEY, recentShareCodes);
      safeSetLocalStorage(NOTES_KEY, notes);
      safeSetLocalStorage(NOTE_FOLDERS_KEY, noteFolders);
      safeSetLocalStorage(HIGHLIGHTS_KEY, highlights);

      // Sidebar collapse state
      safeSetLocalStorage(VIEWS_COLLAPSED_KEY, isViewsCollapsed);
      safeSetLocalStorage(YOUTUBE_FEEDS_COLLAPSED_KEY, isYoutubeFeedsCollapsed);
      safeSetLocalStorage(YOUTUBE_PLAYLISTS_COLLAPSED_KEY, isYoutubePlaylistsCollapsed);
      safeSetLocalStorage(REDDIT_FEEDS_COLLAPSED_KEY, isRedditFeedsCollapsed);
      safeSetLocalStorage(RSS_FEEDS_COLLAPSED_KEY, isRssFeedsCollapsed);
      safeSetLocalStorage(TAGS_COLLAPSED_KEY, isTagsCollapsed);
      safeSetLocalStorage(YOUTUBE_TAGS_COLLAPSED_KEY, isYoutubeTagsCollapsed);
      safeSetLocalStorage(RSS_TAGS_COLLAPSED_KEY, isRssTagsCollapsed);
      safeSetLocalStorage(EXPANDED_TAGS_KEY, expandedTags);
      safeSetLocalStorage(EXPANDED_VIEWS_KEY, expandedViews);
      safeSetLocalStorage(NOTES_COLLAPSED_KEY, isNotesCollapsed);

      // Proxy & settings
      safeSetLocalStorage(PROXY_STATS_KEY, proxyStats);
      safeSetLocalStorage(DISABLED_PROXIES_KEY, disabledProxies);
      safeSetLocalStorage(AUTOPLAY_MODE_KEY, autoplayMode);
      safeSetLocalStorage(AUTO_LIKE_YOUTUBE_VIDEOS_KEY, autoLikeYouTubeVideos);
      safeSetLocalStorage(AUTO_LIKE_DELAY_SECONDS_KEY, autoLikeDelaySeconds);
      safeSetLocalStorage(REFRESH_BATCH_SIZE_KEY, refreshBatchSize);
      safeSetLocalStorage(REFRESH_DELAY_SECONDS_KEY, refreshDelaySeconds);
      safeSetLocalStorage(ENABLE_RSS_REDDIT_KEY, enableRssAndReddit);
      safeSetLocalStorage(DEFAULT_AI_LANGUAGE_KEY, defaultAiLanguage);
      safeSetLocalStorage('media-feeder-personal-interests', personalInterests);
      safeSetLocalStorage(AUTO_UPLOAD_AFTER_REFRESH_KEY, autoUploadAfterRefresh);
      safeSetLocalStorage(AUTO_SUMMARIZE_ON_REFRESH_KEY, autoSummarizeOnRefresh);
      safeSetLocalStorage(AUTO_CLUSTER_ON_REFRESH_KEY, autoClusterOnRefresh);
      safeSetLocalStorage(AUTO_TRANSCRIBE_ON_REFRESH_KEY, autoTranscribeOnRefresh);
      safeSetLocalStorage(AUTO_AI_TIME_WINDOW_DAYS_KEY, autoAiTimeWindowDays);

      // AI state
      safeSetLocalStorage('media-feeder-ai-hierarchy', aiHierarchy);
      safeSetLocalStorage('media-feeder-yt-ai-hierarchy', ytAiHierarchy);
      safeSetLocalStorage('media-feeder-non-yt-ai-hierarchy', nonYtAiHierarchy);
      safeSetLocalStorage('media-feeder-ai-topics-collapsed', isAiTopicsCollapsed);
      safeSetLocalStorage(TRENDING_KEYWORDS_KEY, trendingKeywords);
      safeSetLocalStorage(AI_DISABLED_KEY, isAiDisabled);
    }, 300);
    return () => clearTimeout(timer);
  }, [
    safeSetLocalStorage,
    feeds, isMobileView, isSidebarCollapsed, sidebarTab, sidebarFeedsView,
    gridZoomLevel, articleZoomLevel, articleViewMode, hasEnteredApp,
    readArticleIds, readLaterArticleIds, likedVideoIds, articleTags,
    readLaterOrderYt, readLaterOrderRss, favoritesOrderYt, favoritesOrderRss,
    tagOrders, recentShareCodes, notes, noteFolders,
    isViewsCollapsed, isYoutubeFeedsCollapsed, isYoutubePlaylistsCollapsed,
    isRedditFeedsCollapsed, isRssFeedsCollapsed, isTagsCollapsed,
    isYoutubeTagsCollapsed, isRssTagsCollapsed, expandedTags, expandedViews,
    isNotesCollapsed,
    proxyStats, disabledProxies, autoplayMode, autoLikeYouTubeVideos,
    autoLikeDelaySeconds, refreshBatchSize, refreshDelaySeconds,
    enableRssAndReddit, defaultAiLanguage, personalInterests,
    autoUploadAfterRefresh, autoSummarizeOnRefresh, autoClusterOnRefresh,
    autoTranscribeOnRefresh, autoAiTimeWindowDays,
    aiHierarchy, ytAiHierarchy, nonYtAiHierarchy, isAiTopicsCollapsed,
    trendingKeywords, isAiDisabled,
  ]);

  const contextValue: AppContextType = {
    feeds,
    isInitialLoad,
    isViewLoading,
    selectedFeedId,
    selectedArticle,
    setSelectedArticle,
    currentView,
    contentView,
    readArticleIds,
    readLaterArticleIds,
    likedVideoIds,
    isSidebarCollapsed,
    sidebarTab,
    handleSetSidebarTab,
    isViewsCollapsed,
    isYoutubeFeedsCollapsed,
    isRssFeedsCollapsed,
    isRedditFeedsCollapsed,
    isTagsCollapsed,
    sidebarFeedsView,
    handleSetSidebarFeedsView,
    isYoutubePlaylistsCollapsed,
    expandedTags,
    expandedViews,
    onToggleViewExpansion,
    isAddFeedModalOpen,
    setAddFeedModalOpen,
    isExportModalOpen,
    setIsExportModalOpen,
    isAdvancedInfoModalOpen,
    setIsAdvancedInfoModalOpen,
    isAiSettingsModalOpen,
    setIsAiSettingsModalOpen,
    isImportTextModalOpen,
    setIsImportTextModalOpen,
    isProxyStatsModalOpen,
    setIsProxyStatsModalOpen,
    isTestingSources,
    sourceTestResults,
    handleTestAllSources,
    isCacheInfoModalOpen,
    setIsCacheInfoModalOpen,
    isExportTextModalOpen,
    setIsExportTextModalOpen,
    exportTextContent,
    proxyStats,
    disabledProxies,
    handleResetNetworkSettings,
    handleProxyAttempt,
    handleClearProxyStats,
    handleToggleProxy,
    feedToEdit,
    setFeedToEdit,
    feedToEditTags,
    setFeedToEditTags,
    isDigestModalOpen,
    setIsDigestModalOpen,
    digestState,
    isDigestConfigModalOpen,
    setIsDigestConfigModalOpen,
    articlesForDigest,
    initialDigestLanguage,
    translateDigest,
    isRecommendationsModalOpen,
    setIsRecommendationsModalOpen,
    recommendationsState,
    setRecommendationsState,
    isRelatedModalOpen,
    setIsRelatedModalOpen,
    relatedChannelsState,
    setRelatedChannelsState,
    relatedSourceFeedId,
    setRelatedSourceFeedId,
    bulkEditModalConfig,
    setBulkEditModalConfig,
    toast,
    setToast,
    isRefreshingAll,
    refreshingFeedId,
    refreshProgress,
    allArticles,
    inactiveFeeds,
    inactivePeriod,
    setInactivePeriod,
    allTags,
    youtubeTags,
    rssTags,
    sortedFeeds,
    favoriteFeeds,
    unreadCounts,
    feedsById,
    articlesById,

    // AI
    commentsState,
    handleFetchComments,
    handleFetchArticleDetails,
    youtubeUnreadTagCounts,
    rssUnreadTagCounts,
    unreadPublishedTodayYtCount,
    unreadPublishedTodayRssCount,
    unreadPublishedTodayCount,
    unreadReadLaterYtCount,
    unreadReadLaterRssCount,
    unreadReadLaterCount,
    historyYtCount,
    historyRssCount,
    historyCount,
    unreadFavoritesYtCount,
    unreadFavoritesRssCount,
    unreadFavoritesCount,
    unreadAiSummaryYtCount,
    unreadTranscriptYtCount: 0,
    feedsForPublishedToday,
    feedsForReadLater,
    feedsForHistory,
    unreadCountsForPublishedToday,
    unreadCountsForReadLater,
    feedsByTag,
    articlesToShow,
    articlesForNavigation,
    availableTagsForFilter,
    unreadVisibleCount,
    headerTitle,
    emptyMessage,
    articleNavigation,
    gridZoomLevel,
    canZoomIn,
    canZoomOut,
    articleZoomLevel,
    canArticleZoomIn,
    canArticleZoomOut,
    articleViewMode,
    setArticleViewMode,
    aiModel,
    defaultAiLanguage,
    setDefaultAiLanguage,
    personalInterests,
    setPersonalInterests,
    handleAddPersonalInterest,
    handleRemovePersonalInterest,
    autoplayMode,
    autoLikeYouTubeVideos,
    autoLikeDelaySeconds,
    setAutoLikeDelaySeconds,
    accessToken,
    enableRssAndReddit,
    refreshBatchSize,
    setRefreshBatchSize,
    refreshDelaySeconds,
    setRefreshDelaySeconds,
    activeTagFilter,
    recentShareCodes,
    importCodeFromUrl,
    setImportCodeFromUrl,
    isResolvingArticleUrl,
    handleSetTagFilter,
    handleToggleAutoplayNext,
    handleToggleAutoplayRandom,
    handleToggleAutoplayRepeat,
    handleToggleAutoLikeYouTubeVideos,
    autoUploadAfterRefresh,
    handleToggleAutoUploadAfterRefresh,
    autoSummarizeOnRefresh,
    handleToggleAutoSummarizeOnRefresh,
    autoClusterOnRefresh,
    handleToggleAutoClusterOnRefresh,
    autoTranscribeOnRefresh,
    handleToggleAutoTranscribeOnRefresh,
    autoAiTimeWindowDays,
    setAutoAiTimeWindowDays,
    handleToggleRssAndReddit,
    urlFromExtension,
    setUrlFromExtension,
    isProcessingUrl,
    isDemoMode,
    demoStep,
    startDemo,
    endDemo,
    handleDemoNext,
    handleViewChange,
    handleSelectFeed,
    handleAddFeed,
    handleAddFromRecommendation,
    handleDeleteFeed,
    handleDeleteTag,
    handleRenameTag,
    handleBulkDeleteFeeds,
    handleToggleFavorite,
    handleSaveFeedTitle,
    handleSaveFeedTags,
    handleSaveFeedMaxArticles,
    handleToggleReadStatus,
    handleToggleReadLater,
    handleSummaryGenerated,
    handleRefreshSingleFeed,
    handleRefreshAllTranscripts,
    handleRefreshCurrentView,
    handleRefreshMissingIcons,
    handleGenerateDigest,
    handleExecuteDetailedDigest,
    handleExecuteThematicDigest,
    handleGenerateRecommendations,
    handleGenerateMoreRecommendations,
    handleResetRecommendations,
    handleExportFeeds,
    handleExportChannelsAsText,
    handleShareToCloudLink,
    handleImportData,
    handleOpenClearDataModal,
    handleClearArticles,
    handleFactoryReset,
    handleSearch,
    handleClearSearch,
    handleClearHistory,
    handleClearReadLater,
    handleMarkAllInAllFeedsAsRead,
    handleMarkAllRead,
    handleMarkSelectedAsRead,
    handleOpenArticle,
    handleCloseArticleModal,
    handleRemoveArticle,
    handleBulkDeleteArticles,
    handleReorderArticles,
    handleOpenRelatedModal,
    handleCloseRelatedModal,
    handleGenerateRelated,
    handleBulkUpdateTags,
    handleOpenBulkEdit,
    handleOpenBulkEditForTag,
    handleOpenBulkEditForFavorites,
    onToggleSidebar,
    onToggleViewsCollapse,
    onToggleYoutubeFeedsCollapse,
    onToggleRssFeedsCollapse,
    onToggleRedditFeedsCollapse,
    onToggleTagsCollapse,
    onToggleTagExpansion,
    onToggleYoutubePlaylistsCollapse,
    isYoutubeTagsCollapsed,
    onToggleYoutubeTagsCollapse,
    isRssTagsCollapsed,
    onToggleRssTagsCollapse,
    handleZoomIn,
    handleZoomOut,
    handleArticleZoomIn,
    handleArticleZoomOut,
    calculateStorageSize,
    handleClearArticlesCache,
    handleClearAllTags,
    userProfile,
    handleGoogleSignIn,
    handleGoogleSignOut,
    handleImportBundledChannels,
    isBundledChannelsModalOpen,
    setIsBundledChannelsModalOpen,
    isImportYouTubeModalOpen,
    setIsImportYouTubeModalOpen,
    youTubeImportState,
    handleFetchYouTubeSubscriptions,
    handleClearYouTubeImportState,
    handleAddYouTubeChannels,
    handleLikeVideo,
    articleToEditTags,
    setArticleToEditTags,
    isBulkEditArticleTagsModalOpen,
    setIsBulkEditArticleTagsModalOpen,
    selectedArticleIdsForBatch,
    handleToggleArticleSelection,
    handleSelectAllArticles,
    handleClearArticleSelection,
    handleSaveArticleTags,
    handleBulkSaveArticleTags,
    handleBulkClearArticleTags,
    videoToAdd,
    handleConfirmAddChannel,
    handleConfirmAddSingleVideo,
    handleCancelAddVideoOrChannel,
    hasEnteredApp,
    handleEnterApp,
    youtubeFeeds,
    rssAndOtherFeeds,
    feedsForGrid,
    isMobileView,
    driveSyncStatus,
    handleUploadToDrive,
    handleDownloadFromDrive,
    isTrendingKeywordsModalOpen,
    setIsTrendingKeywordsModalOpen,
    trendingKeywords,
    isGeneratingKeywords,
    keywordGenerationError,
    handleGenerateTrendingKeywords,
    isGeneratingEbook,
    handleGenerateEbook,
    isGeneratingEbookFromView,
    handleGenerateEbookFromView,
    isGeneratingSummaries,
    handleGenerateSummariesForSelected,
    handleGenerateSummariesForView,
    summaryGenerationProgress,
    notes,
    noteFolders,
    isNoteEditorModalOpen,
    noteToEdit,
    initialNoteContent,
    handleOpenNoteEditor,
    handleCloseNoteEditor,
    handleSaveNote,
    handleDeleteNote,
    handleAddNoteFolder,
    handleDeleteNoteFolder,
    handleSaveSummaryAsNote,
    handleSaveDigestAsNote,
    highlights,
    handleAddHighlight,
    handleRemoveHighlight,
    handleUpdateHighlightNote,
    notesForView,
    isSavingViewAsNote,
    handleSaveViewAsNote,
    isSavingSelectionAsNote,
    handleSaveSelectionAsNote,
    isEpubSettingsModalOpen,
    setIsEpubSettingsModalOpen,
    epubDefaults,
    handleConfirmGenerateEbook,
    isClearDataModalOpen,
    setIsClearDataModalOpen,
    isSyncDataModalOpen,
    setIsSyncDataModalOpen,
    isActionsMenuOpen,
    setIsActionsMenuOpen,
    isNotesCollapsed,
    onToggleNotesCollapse,
    isRefreshOptionsModalOpen,
    setIsRefreshOptionsModalOpen,
    refreshModalInitialState,
    handleOpenRefreshOptionsModal,
    handleExecuteRefresh,
    handleQuotaError,
    handleSuccessfulApiCall,
    isAiDisabled,
    aiHierarchy,
    setAiHierarchy,
    ytAiHierarchy,
    setYtAiHierarchy,
    nonYtAiHierarchy,
    setNonYtAiHierarchy,
    isAiTopicsCollapsed,
    onToggleAiTopicsCollapse,
  };

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};
