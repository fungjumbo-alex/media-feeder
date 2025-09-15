import React, { createContext, useState, useEffect, useCallback, useMemo, useRef, useContext, ReactNode } from 'react';
import { fetchAndParseRss } from '../services/rssService';
import { generateRecommendations, generateRelatedChannels, translateDigestContent, generateTranscriptDigest, fetchAvailableCaptionChoices, fetchAndParseTranscript } from '../services/geminiService';
import { fetchYouTubeComments, getYouTubeId, fetchYouTubeVideoDetails, likeYouTubeVideo, fetchYouTubeSubscriptions, fetchPlaylistAsFeed, fetchSingleYouTubeVideoAsArticle } from '../services/youtubeService';
import { fetchContentFromPastebinUrl } from '../services/pastebinService';
import type { Feed, Article, HistoryDigest, RecommendedFeed, SyncData, GridZoomLevel, WebSource, ProxyStats, FeedType, AiModel, AutoplayMode, StructuredVideoSummary, YouTubeComment, UserProfile, YouTubeSubscription } from '../types';
import { ZOOM_LEVELS, AVAILABLE_MODELS } from '../types';
import * as LZString from 'lz-string';
import { fetchViaProxy } from '../services/proxyService';

const FEEDS_STORAGE_KEY = 'media-feeder-feeds-v3';
const ARTICLE_TAGS_KEY = 'media-feeder-article-tags-v1';
const READ_ARTICLES_KEY = 'media-feeder-read-articles-v2';
const READ_LATER_KEY = 'media-feeder-read-later-v2';
const LIKED_YOUTUBE_VIDEOS_KEY = 'media-feeder-liked-videos';
const SIDEBAR_COLLAPSED_KEY = 'media-feeder-sidebar-collapsed';
const VIEWS_COLLAPSED_KEY = 'media-feeder-views-collapsed';
const TAGS_COLLAPSED_KEY = 'media-feeder-tags-collapsed';
const EXPANDED_TAGS_KEY = 'media-feeder-expanded-tags';
const FAVORITES_COLLAPSED_KEY = 'media-feeder-favorites-collapsed';
const YOUTUBE_FEEDS_COLLAPSED_KEY = 'media-feeder-youtube-feeds-collapsed';
const YOUTUBE_PLAYLISTS_COLLAPSED_KEY = 'media-feeder-youtube-playlists-collapsed';
const REDDIT_FEEDS_COLLAPSED_KEY = 'media-feeder-reddit-feeds-collapsed';
const RSS_FEEDS_COLLAPSED_KEY = 'media-feeder-rss-feeds-collapsed';
const GRID_ZOOM_LEVEL_KEY = 'media-feeder-grid-zoom-level';
const ARTICLE_ZOOM_LEVEL_KEY = 'media-feeder-article-zoom-level';
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
const RECENT_SHARE_CODES_KEY = 'media-feeder-recent-share-codes';
const HAS_ENTERED_KEY = 'media-feeder-has-entered';
const READ_LATER_ORDER_KEY = 'media-feeder-read-later-order-v1';
const TAG_ORDERS_KEY = 'media-feeder-tag-orders-v1';
const FAVORITES_ORDER_KEY = 'media-feeder-favorites-order-v1';


type YouTubeImportState = { status: 'idle' | 'loading' | 'loaded' | 'error'; subscriptions: YouTubeSubscription[]; error: string | null; }
type CurrentView = { type: string; value?: any; };
type CommentState = { comments: YouTubeComment[] | null; isLoading: boolean; error: string | null; };
type DigestState = { digest: HistoryDigest | null; error: string | null; isLoading: boolean; loadingMessage: string | null; };

interface BulkEditModalConfig {
    isOpen: boolean;
    mode: 'add' | 'set' | 'favorite';
    tag?: string;
}

const getStoredData = <T,>(key: string, defaultValue: T, reviver?: (key: string, value: any) => any): T => {
    try { const stored = localStorage.getItem(key); return stored ? JSON.parse(stored, reviver) : defaultValue; } catch (e) { console.error(`Failed to parse stored data for key "${key}":`, e); return defaultValue; }
};
const getPrunedReadArticleIds = (): Map<string, number> => {
    const storedIds = getStoredData<Map<string, number>>(READ_ARTICLES_KEY, new Map(), (k, v) => k === "" ? new Map(v) : v);
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    const newReadIds = new Map<string, number>();
    for (const [id, timestamp] of storedIds.entries()) { if ((timestamp as number) >= twentyFourHoursAgo) newReadIds.set(id, timestamp); }
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
    
    // Handle legacy import format for backward compatibility
    if (hash.startsWith('import=')) {
        const code = hash.substring(7);
        if (code) return { type: 'import', value: decodeURIComponent(code) };
    }

    // This check must come before the general split
    if (hash.startsWith('article/')) {
        const parts = hash.substring(8).split('/');
        if (parts.length >= 2) {
            return {
                type: 'article',
                value: {
                    feedId: decodeURIComponent(parts[0]),
                    articleId: decodeURIComponent(parts[1])
                }
            };
        }
    }

    const [type, ...valueParts] = hash.split('/');
    const value = valueParts.join('/'); 

    if (type === 'feed' && value) return { type: 'feed', value: decodeURIComponent(value) };
    if (type === 'tag' && value) return { type: 'tag', value: decodeURIComponent(value) };
    if (type === 'search' && value) return { type: 'search', value: decodeURIComponent(value) };
    if (type === 'import' && value) return { type: 'import', value: decodeURIComponent(value) };
    
    const validTypes = ['all-subscriptions', 'favorites', 'readLater', 'published-today', 'history', 'inactive-feeds', 'dump', 'privacy-policy', 'about'];
    if (validTypes.includes(type)) return { type };
    
    return { type: 'all-subscriptions' }; // Fallback
};

interface AppContextType {
    feeds: Feed[]; isInitialLoad: boolean; isViewLoading: boolean; selectedFeedId: string | null; selectedArticle: Article | null; setSelectedArticle: React.Dispatch<React.SetStateAction<Article | null>>;
    currentView: CurrentView; contentView: 'articles' | 'feedsGrid' | 'inactiveFeeds' | 'dump' | 'privacyPolicy' | 'about'; readArticleIds: Map<string, number>; readLaterArticleIds: Set<string>; likedVideoIds: Set<string>;
    isSidebarCollapsed: boolean; isViewsCollapsed: boolean; isYoutubeFeedsCollapsed: boolean; isRssFeedsCollapsed: boolean; isRedditFeedsCollapsed: boolean; isTagsCollapsed: boolean;
    isYoutubePlaylistsCollapsed: boolean; 
    expandedTags: Set<string>; isFavoritesCollapsed: boolean;
    isAddFeedModalOpen: boolean; setAddFeedModalOpen: React.Dispatch<React.SetStateAction<boolean>>; 
    isExportModalOpen: boolean; setIsExportModalOpen: React.Dispatch<React.SetStateAction<boolean>>; isAdvancedInfoModalOpen: boolean; setIsAdvancedInfoModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isAiSettingsModalOpen: boolean; setIsAiSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>; isImportTextModalOpen: boolean; setIsImportTextModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isProxyStatsModalOpen: boolean; setIsProxyStatsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isCacheInfoModalOpen: boolean; setIsCacheInfoModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isExportTextModalOpen: boolean; setIsExportTextModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isClearDataModalOpen: boolean; setIsClearDataModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    exportTextContent: string;
    proxyStats: ProxyStats; disabledProxies: Set<string>; handleProxyAttempt: (proxyName: string, status: 'success' | 'failure', feedType: FeedType) => void; handleClearProxyStats: () => void; handleToggleProxy: (proxyName: string, feedType: FeedType) => void;
    feedToEdit: Feed | null; setFeedToEdit: React.Dispatch<React.SetStateAction<Feed | null>>; feedToEditTags: Feed | null; setFeedToEditTags: React.Dispatch<React.SetStateAction<Feed | null>>;
    isDigestModalOpen: boolean; setIsDigestModalOpen: React.Dispatch<React.SetStateAction<boolean>>; digestState: DigestState;
    isDigestConfigModalOpen: boolean; setIsDigestConfigModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    articlesForDigest: Article[]; initialDigestLanguage: string;
    translateDigest: (digest: HistoryDigest, targetLanguage: string) => Promise<HistoryDigest>; isRecommendationsModalOpen: boolean; setIsRecommendationsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    recommendationsState: { recommendations: RecommendedFeed[] | null; error: string | null; isLoading: boolean }; setRecommendationsState: React.Dispatch<React.SetStateAction<{ recommendations: RecommendedFeed[] | null; error: string | null; isLoading: boolean }>>;
    isRelatedModalOpen: boolean; setIsRelatedModalOpen: React.Dispatch<React.SetStateAction<boolean>>; relatedChannelsState: { recommendations: RecommendedFeed[] | null; error: string | null; isLoading: boolean };
    setRelatedChannelsState: React.Dispatch<React.SetStateAction<{ recommendations: RecommendedFeed[] | null; error: string | null; isLoading: boolean }>>;
    relatedSourceFeedId: string | null; setRelatedSourceFeedId: React.Dispatch<React.SetStateAction<string | null>>;
    bulkEditModalConfig: BulkEditModalConfig; setBulkEditModalConfig: React.Dispatch<React.SetStateAction<BulkEditModalConfig>>;
    toast: { message: string; type: 'success' | 'error' } | null; setToast: React.Dispatch<React.SetStateAction<{ message: string; type: 'success' | 'error' } | null>>;
    isRefreshingAll: boolean; refreshingFeedId: string | null; refreshProgress: number | null; allArticles: Article[]; inactiveFeeds: (Feed & { lastPostTimestamp: number })[];
    inactivePeriod: 1 | 3 | 6 | 12 | 'all'; setInactivePeriod: React.Dispatch<React.SetStateAction<1 | 3 | 6 | 12 | 'all'>>; allTags: string[]; sortedFeeds: Feed[]; favoriteFeeds: Feed[]; unreadCounts: Record<string, number>;
    commentsState: CommentState;
    handleFetchComments: (videoId: string) => Promise<void>;
    handleFetchArticleDetails: (articleId: string) => Promise<void>;
    unreadTagCounts: Record<string, number>; unreadFavoritesCount: number; feedsByTag: Map<string, Feed[]>; articlesToShow: Article[]; articlesForNavigation: Article[]; availableTagsForFilter: string[]; unreadVisibleCount: number; headerTitle: string; emptyMessage: string; articleNavigation: { hasNextArticle: boolean; hasPreviousArticle: boolean; onNextArticle: () => void; onPreviousArticle: () => void; };
    gridZoomLevel: GridZoomLevel; canZoomIn: boolean; canZoomOut: boolean; articleZoomLevel: GridZoomLevel; canArticleZoomIn: boolean; canArticleZoomOut: boolean;
    aiModel: AiModel;
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
    handleToggleRssAndReddit: () => void;
    urlFromExtension: string | null;
    setUrlFromExtension: React.Dispatch<React.SetStateAction<string | null>>;
    isProcessingUrl: boolean;
    isDemoMode: boolean;
    demoStep: number;
    startDemo: () => void;
    endDemo: () => void;
    handleDemoNext: () => void;
    handleViewChange: (type: string, value?: string) => void; handleSelectFeed: (feedId: string) => void; handleAddFeed: (rawUrl: string, maxArticles: number, options?: { headless?: boolean }) => Promise<Feed | void>;
    handleAddFromRecommendation: (url: string, title: string, inheritedTags?: string[]) => Promise<void>; handleDeleteFeed: (feedId: string) => void;
    handleDeleteTag: (tagToDelete: string) => void;
    handleBulkDeleteFeeds: (feedIds: Set<string>) => void; handleToggleFavorite: (feedId: string) => void; handleSaveFeedTitle: (feedId: string, title: string) => void;
    handleSaveFeedMaxArticles: (feedId: string, maxArticles: number) => void;
    handleSaveFeedTags: (feedId: string, tags: string[]) => void; handleToggleReadStatus: (articleId: string) => void; handleToggleReadLater: (articleId: string) => void;
    handleSummaryGenerated: (articleId: string, summary: string | StructuredVideoSummary, sources?: WebSource[]) => void; 
    handleRefreshSingleFeed: (feedId: string) => Promise<void>; handleRefreshAllFeeds: () => Promise<void>; handleRefreshFavorites: () => Promise<void>; handleRefreshTaggedFeeds: () => Promise<void>; handleRefreshCurrentView: () => Promise<void>;
    handleRefreshMissingIcons: () => Promise<void>;
    handleGenerateDigest: () => void; handleExecuteDigest: (selectedArticles: Article[], targetLanguage: string) => Promise<void>; handleGenerateRecommendations: (customQuery?: string) => Promise<void>; handleGenerateMoreRecommendations: (customQuery?: string) => Promise<void>;
    handleResetRecommendations: () => void; handleExportFeeds: (options: { favoritesOnly?: boolean; tag?: string; }) => void;
    handleExportChannelsAsText: () => void;
    handleShareToCloudLink: (options?: { tag?: string }) => Promise<string>;
    handleImportData: (data: SyncData) => void;
    handleOpenClearDataModal: () => void;
    handleClearArticlesAndHistory: () => void;
    handleFactoryReset: () => void;
    handleSearch: (query: string) => void; handleClearSearch: () => void;
    handleClearHistory: () => void; handleClearReadLater: () => void; handleMarkAllInAllFeedsAsRead: () => void; handleMarkAllRead: () => void; 
    handleMarkSelectedAsRead: () => void;
    handleOpenArticle: (article: Article) => void;
    handleCloseArticleModal: () => void;
    handleRemoveArticle: (articleId: string, feedId: string) => void;
    handleBulkDeleteArticles: () => void;
    handleReorderArticles: (view: { type: string, value?: any }, sourceId: string, targetId: string | null) => void;
    handleOpenRelatedModal: (feedId: string) => void; handleCloseRelatedModal: () => void; handleGenerateRelated: () => Promise<void>;
    handleBulkUpdateTags: (feedIds: Set<string>, tags: string[], mode: 'add' | 'set' | 'favorite') => void;
    handleOpenBulkEdit: () => void; handleOpenBulkEditForTag: (tag: string) => void; handleOpenBulkEditForFavorites: () => void; onToggleSidebar: () => void; onToggleViewsCollapse: () => void;
    onToggleYoutubeFeedsCollapse: () => void; onToggleRssFeedsCollapse: () => void; onToggleRedditFeedsCollapse: () => void; onToggleTagsCollapse: () => void; onToggleTagExpansion: (tag: string) => void; onToggleFavoritesCollapse: () => void;
    onToggleYoutubePlaylistsCollapse: () => void; 
    handleZoomIn: () => void; handleZoomOut: () => void; handleArticleZoomIn: () => void; handleArticleZoomOut: () => void;
    calculateStorageSize: () => string; handleClearArticlesCache: () => void; handleClearAllTags: () => void;
    userProfile: UserProfile | null;
    handleGoogleSignIn: (options?: { showConsentPrompt?: boolean, isSilent?: boolean }) => void;
    handleGoogleSignOut: () => void;
    isBundledChannelsModalOpen: boolean;
    setIsBundledChannelsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    handleImportBundledChannels: (feedsToImport: Omit<Feed, 'id' | 'items' | 'error'>[]) => void;
    isImportYouTubeModalOpen: boolean;
    setIsImportYouTubeModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    youTubeImportState: YouTubeImportState;
    handleFetchYouTubeSubscriptions: () => Promise<void>;
    handleClearYouTubeImportState: () => void;
    handleAddYouTubeChannels: (subscriptions: YouTubeSubscription[]) => Promise<void>;
    handleLikeVideo: (article: Article, options?: { isAutoLike?: boolean }) => Promise<void>;
    // Article Tagging State & Handlers
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
    // Add single video vs. channel
    videoToAdd: Article | null;
    handleConfirmAddChannel: (channelUrl: string, channelTitle: string) => Promise<void>;
    handleConfirmAddSingleVideo: (videoArticle: Article) => Promise<void>;
    handleCancelAddVideoOrChannel: () => void;
    // Homepage
    hasEnteredApp: boolean;
    handleEnterApp: () => void;
}
const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

export const AppProvider: React.FC<{children: ReactNode}> = ({ children }) => {

    const [feeds, setFeeds] = useState<Feed[]>(() => getStoredData(FEEDS_STORAGE_KEY, []));
    const [articleTags, setArticleTags] = useState<Map<string, string[]>>(() => getStoredData(ARTICLE_TAGS_KEY, new Map(), (k, v) => k === "" ? new Map(v) : v));
    const [readLaterOrder, setReadLaterOrder] = useState<string[]>(() => getStoredData(READ_LATER_ORDER_KEY, []));
    const [tagOrders, setTagOrders] = useState<Record<string, string[]>>(() => getStoredData(TAG_ORDERS_KEY, {}));
    const [favoritesOrder, setFavoritesOrder] = useState<string[]>(() => getStoredData(FAVORITES_ORDER_KEY, []));
    const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
    const [isViewLoading] = useState(false);
    const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
    const [currentView, setCurrentView] = useState<CurrentView>(getInitialView);
    // State to hold the view that provides the list of articles for navigation.
    const [backgroundView, setBackgroundView] = useState<CurrentView>(() => {
        const initialView = getInitialView();
        // If starting on an article, we don't know the background. Default to a sensible fallback.
        return initialView.type === 'article' ? { type: 'all-subscriptions' } : initialView;
    });
    const [selectedFeedId, setSelectedFeedId] = useState<string | null>(() => {
        const initialView = getInitialView();
        return initialView.type === 'feed' ? initialView.value || null : null;
    });
    const [gridZoomLevel, setGridZoomLevel] = useState<GridZoomLevel>(() => getStoredData(GRID_ZOOM_LEVEL_KEY, 'md'));
    const [articleZoomLevel, setArticleZoomLevel] = useState<GridZoomLevel>(() => getStoredData(ARTICLE_ZOOM_LEVEL_KEY, 'md'));
    const [readArticleIds, setReadArticleIds] = useState<Map<string, number>>(getPrunedReadArticleIds);
    const [readLaterArticleIds, setReadLaterArticleIds] = useState<Set<string>>(() => getStoredData(READ_LATER_KEY, new Set(), (k, v) => k === "" ? new Set(v) : v));
    const [likedVideoIds, setLikedVideoIds] = useState<Set<string>>(() => getStoredData(LIKED_YOUTUBE_VIDEOS_KEY, new Set(), (k, v) => k === "" ? new Set(v) : v));
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => getStoredData(SIDEBAR_COLLAPSED_KEY, false));
    const [isViewsCollapsed, setIsViewsCollapsed] = useState<boolean>(() => getStoredData(VIEWS_COLLAPSED_KEY, false));
    const [isFavoritesCollapsed, setIsFavoritesCollapsed] = useState<boolean>(() => getStoredData(FAVORITES_COLLAPSED_KEY, false));
    const [isYoutubeFeedsCollapsed, setIsYoutubeFeedsCollapsed] = useState<boolean>(() => getStoredData(YOUTUBE_FEEDS_COLLAPSED_KEY, false));
    const [isYoutubePlaylistsCollapsed, setIsYoutubePlaylistsCollapsed] = useState<boolean>(() => getStoredData(YOUTUBE_PLAYLISTS_COLLAPSED_KEY, false));
    const [isRedditFeedsCollapsed, setIsRedditFeedsCollapse] = useState<boolean>(() => getStoredData(REDDIT_FEEDS_COLLAPSED_KEY, false));
    const [isRssFeedsCollapsed, setIsRssFeedsCollapse] = useState<boolean>(() => getStoredData(RSS_FEEDS_COLLAPSED_KEY, false));
    const [isTagsCollapsed, setIsTagsCollapsed] = useState<boolean>(() => getStoredData(TAGS_COLLAPSED_KEY, true));
    const [expandedTags, setExpandedTags] = useState<Set<string>>(() => getStoredData(EXPANDED_TAGS_KEY, new Set(), (k, v) => k === "" ? new Set(v) : v));
    const [isAddFeedModalOpen, setAddFeedModalOpen] = useState<boolean>(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExportTextModalOpen, setIsExportTextModalOpen] = useState(false);
    const [exportTextContent, setExportTextContent] = useState('');
    const [isAdvancedInfoModalOpen, setIsAdvancedInfoModalOpen] = useState(false);
    const [isAiSettingsModalOpen, setIsAiSettingsModalOpen] = useState(false);
    const [isImportTextModalOpen, setIsImportTextModalOpen] = useState(false);
    const [isProxyStatsModalOpen, setIsProxyStatsModalOpen] = useState(false);
    const [isCacheInfoModalOpen, setIsCacheInfoModalOpen] = useState(false);
    const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
    const [proxyStats, setProxyStats] = useState<ProxyStats>(() => getStoredData(PROXY_STATS_KEY, {}));
    const [disabledProxies, setDisabledProxies] = useState<Set<string>>(() => getStoredData(DISABLED_PROXIES_KEY, new Set(), (k, v) => k === "" ? new Set(v) : v));
    const [feedToEdit, setFeedToEdit] = useState<Feed | null>(null);
    const [feedToEditTags, setFeedToEditTags] = useState<Feed | null>(null);
    const [isDigestConfigModalOpen, setIsDigestConfigModalOpen] = useState(false);
    const [articlesForDigest, setArticlesForDigest] = useState<Article[]>([]);
    const [initialDigestLanguage, setInitialDigestLanguage] = useState('original');
    const [isDigestModalOpen, setIsDigestModalOpen] = useState(false);
    const [digestState, setDigestState] = useState<DigestState>({ digest: null, error: null, isLoading: false, loadingMessage: null });
    const [isRecommendationsModalOpen, setIsRecommendationsModalOpen] = useState(false);
    const [recommendationsState, setRecommendationsState] = useState<{ recommendations: RecommendedFeed[] | null; error: string | null; isLoading: boolean }>({ recommendations: null, error: null, isLoading: false });
    const [isRelatedModalOpen, setIsRelatedModalOpen] = useState(false);
    const [relatedSourceFeedId, setRelatedSourceFeedId] = useState<string | null>(null);
    const [relatedChannelsState, setRelatedChannelsState] = useState<{ recommendations: RecommendedFeed[] | null; error: string | null; isLoading: boolean }>({ recommendations: null, error: null, isLoading: false });
    const [bulkEditModalConfig, setBulkEditModalConfig] = useState<BulkEditModalConfig>({ isOpen: false, mode: 'add', tag: undefined });
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isRefreshingAll, setIsRefreshingAll] = useState(false);
    const [refreshingFeedId, setRefreshingFeedId] = useState<string | null>(null);
    const [refreshProgress, setRefreshProgress] = useState<number | null>(null);
    const [inactivePeriod, setInactivePeriod] = useState<1 | 3 | 6 | 12 | 'all'>(3);
    const [autoplayMode, setAutoplayMode] = useState<AutoplayMode>(() => getStoredData(AUTOPLAY_MODE_KEY, 'off'));
    const [autoLikeYouTubeVideos, setAutoLikeYouTubeVideos] = useState<boolean>(() => getStoredData(AUTO_LIKE_YOUTUBE_VIDEOS_KEY, false));
    const [autoLikeDelaySeconds, setAutoLikeDelaySeconds] = useState<number>(() => getStoredData(AUTO_LIKE_DELAY_SECONDS_KEY, 10));
    const [enableRssAndReddit, setEnableRssAndReddit] = useState<boolean>(() => getStoredData(ENABLE_RSS_REDDIT_KEY, false));
    const [urlFromExtension, setUrlFromExtension] = useState<string | null>(null);
    const [isProcessingUrl] = useState(false);
    const [refreshBatchSize, setRefreshBatchSize] = useState<number>(() => getStoredData(REFRESH_BATCH_SIZE_KEY, 50));
    const [refreshDelaySeconds, setRefreshDelaySeconds] = useState<number>(() => getStoredData(REFRESH_DELAY_SECONDS_KEY, 10));
    const [commentsState, setCommentsState] = useState<CommentState>({ comments: null, isLoading: false, error: null });
    const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
    const [recentShareCodes, setRecentShareCodes] = useState<string[]>(() => getStoredData(RECENT_SHARE_CODES_KEY, []));
    const [importCodeFromUrl, setImportCodeFromUrl] = useState<string | null>(null);
    const [isBundledChannelsModalOpen, setIsBundledChannelsModalOpen] = useState(false);
    const [isImportYouTubeModalOpen, setIsImportYouTubeModalOpen] = useState(false);
    const [youTubeImportState, setYouTubeImportState] = useState<YouTubeImportState>({ status: 'idle', subscriptions: [], error: null });
    const [accessToken, setAccessToken] = useState<string | null>(() => {
        const token = localStorage.getItem('gapi_access_token');
        const expiresAt = localStorage.getItem('gapi_access_token_expires_at');
        if (token && expiresAt && Date.now() < parseInt(expiresAt, 10)) {
            return token;
        }
        localStorage.removeItem('gapi_access_token');
        localStorage.removeItem('gapi_access_token_expires_at');
        localStorage.removeItem('gapi_user_profile');
        return null;
    });
    const [userProfile, setUserProfile] = useState<UserProfile | null>(() => getStoredData('gapi_user_profile', null));
    const [isResolvingArticleUrl, setIsResolvingArticleUrl] = useState(false);
    const tokenClientRef = useRef<google.accounts.oauth2.TokenClient | null>(null);
    const queuedLikeRef = useRef<{ article: Article; isAutoLike: boolean } | null>(null);
    const tokenRefreshTimerRef = useRef<number | null>(null);
    const [videoToAdd, setVideoToAdd] = useState<Article | null>(null);

    // Article Tagging State
    const [articleToEditTags, setArticleToEditTags] = useState<Article | null>(null);
    const [isBulkEditArticleTagsModalOpen, setIsBulkEditArticleTagsModalOpen] = useState(false);
    const [selectedArticleIdsForBatch, setSelectedArticleIdsForBatch] = useState<Set<string>>(new Set());

    // Demo Mode State
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [demoStep, setDemoStep] = useState(0);
    const [hasEnteredApp, setHasEnteredApp] = useState<boolean>(() => getStoredData(HAS_ENTERED_KEY, false));


    const aiModel: AiModel = AVAILABLE_MODELS[0];
    
    // All Memoized Values
    const feedsToShowInApp = useMemo(() => {
        if (enableRssAndReddit) return feeds;
        return feeds.filter(feed => {
            const isYouTube = feed.url.includes('youtube.com');
            const isBilibili = feed.url.includes('bilibili.com');
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
            return feed.items.map(item => {
                const articleSpecificTags = new Set(articleTags.get(item.id) || []);
                const allCurrentTags = new Set([...feedTags, ...articleSpecificTags]);
                return {
                    ...item,
                    tags: allCurrentTags.size > 0 ? Array.from(allCurrentTags).sort() : undefined
                };
            });
        });
    }, [feedsToShowInApp, articleTags]);
    
    const allTags = useMemo(() => {
        const activeTags = new Set<string>();
        
        feedsToShowInApp.forEach(feed => {
            if (feed.tags) {
                feed.tags.forEach(tag => activeTags.add(tag));
            }
        });
        
        allArticles.forEach(article => {
            if (article.tags) {
                article.tags.forEach(tag => activeTags.add(tag));
            }
        });
        
        return Array.from(activeTags).sort();
    }, [feedsToShowInApp, allArticles]);

    const feedsById = useMemo(() => new Map(feedsToShowInApp.map(feed => [feed.id, feed])), [feedsToShowInApp]);
    const articlesById = useMemo(() => new Map(deduplicateArticles(allArticles).map(article => [article.id, article])), [allArticles]);
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

        // Step 1: Collect all tags and the feed IDs associated with them
        sortedFeeds.forEach(feed => {
            // From feed tags
            (feed.tags || []).forEach(tag => {
                if (!feedIdsByTag.has(tag)) feedIdsByTag.set(tag, new Set());
                feedIdsByTag.get(tag)!.add(feed.id);
            });
            // From article tags within the feed
            feed.items.forEach(item => {
                const articleSpecificTags = articleTags.get(item.id);
                (articleSpecificTags || []).forEach(tag => {
                    if (!feedIdsByTag.has(tag)) feedIdsByTag.set(tag, new Set());
                    feedIdsByTag.get(tag)!.add(feed.id);
                });
            });
        });

        // Step 2: Build the final map of tag -> Feed[]
        for (const [tag, feedIds] of feedIdsByTag.entries()) {
            // We want to preserve the order from sortedFeeds
            const feedsForThisTag = sortedFeeds.filter(feed => feedIds.has(feed.id));
            if (feedsForThisTag.length > 0) {
                map.set(tag, feedsForThisTag);
            }
        }

        return map;
    }, [sortedFeeds, articleTags]);

    const unreadTagCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        allTags.forEach(tag => counts[tag] = 0);

        const unreadTaggedArticleIds = new Map<string, Set<string>>(); // Map<tag, Set<articleId>>

        const unreadArticles = allArticles.filter(a => !readArticleIds.has(a.id));

        unreadArticles.forEach(article => {
            if (article.tags) {
                article.tags.forEach(tag => {
                    if (!unreadTaggedArticleIds.has(tag)) {
                        unreadTaggedArticleIds.set(tag, new Set());
                    }
                    unreadTaggedArticleIds.get(tag)!.add(article.id);
                });
            }
        });
        
        for (const [tag, articleIds] of unreadTaggedArticleIds.entries()) {
            counts[tag] = articleIds.size;
        }

        return counts;
    }, [allTags, allArticles, readArticleIds]);
    const unreadFavoritesCount = useMemo(() => {
        return favoriteFeeds.reduce((sum, feed) => sum + (unreadCounts[feed.id] || 0), 0);
    }, [favoriteFeeds, unreadCounts]);
    const contentView: 'articles' | 'feedsGrid' | 'inactiveFeeds' | 'dump' | 'privacyPolicy' | 'about' = useMemo(() => {
        if (currentView.type === 'all-subscriptions') return 'feedsGrid';
        if (currentView.type === 'inactive-feeds') return 'inactiveFeeds';
        if (currentView.type === 'dump') return 'dump';
        if (currentView.type === 'privacy-policy') return 'privacyPolicy';
        if (currentView.type === 'about') return 'about';
        return 'articles';
    }, [currentView]);

    const { articlesToShow, availableTagsForFilter } = useMemo(() => {
        let rawArticles: Article[];
        let needsDeduplication = false;

        switch (currentView.type) {
            case 'feed':
                // Re-map over the original items to get the correct tags, preserving order.
                const feedToDisplay = feedsById.get(currentView.value || '');
                if (feedToDisplay) {
                    const articleIdsInFeed = new Set(feedToDisplay.items.map(i => i.id));
                    // Filter allArticles to get the correctly tagged versions, then sort by the original order.
                    const taggedItemsMap = new Map(allArticles
                        .filter(a => a.feedId === currentView.value && articleIdsInFeed.has(a.id))
                        .map(a => [a.id, a])
                    );
                    rawArticles = feedToDisplay.items.map(item => taggedItemsMap.get(item.id) || item);
                } else {
                    rawArticles = [];
                }
                break;
            case 'search':
                if (!currentView.value) rawArticles = [];
                else {
                    const query = currentView.value.toLowerCase();
                    rawArticles = allArticles.filter(a => a.title.toLowerCase().includes(query) || a.description.toLowerCase().includes(query));
                }
                needsDeduplication = true;
                break;
            case 'readLater':
                rawArticles = Array.from(readLaterArticleIds).map(id => articlesById.get(id)).filter((a): a is Article => !!a);
                break;
            case 'history':
                rawArticles = Array.from(readArticleIds.keys()).map(id => articlesById.get(id)).filter((a): a is Article => !!a);
                break;
            case 'favorites':
                const favoriteFeedIds = new Set(favoriteFeeds.map(f => f.id));
                rawArticles = allArticles.filter(a => favoriteFeedIds.has(a.feedId));
                needsDeduplication = true;
                break;
            case 'tag':
                const tag = currentView.value || '';
                rawArticles = allArticles.filter(article => article.tags?.includes(tag));
                needsDeduplication = true;
                break;
            case 'published-today':
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayTimestamp = today.getTime();
                rawArticles = allArticles.filter(a => a.pubDateTimestamp && a.pubDateTimestamp >= todayTimestamp);
                needsDeduplication = true; 
                break;
            default:
                rawArticles = [];
        }
        
        const sortArticles = (articles: Article[]): Article[] => {
            // Helper for sorting by custom order, placing new items at the top sorted by date.
            const sortByCustomOrder = (order: string[]) => {
                const orderMap = new Map(order.map((id, index) => [id, index]));
                return [...articles].sort((a, b) => {
                    const aIndex = orderMap.get(a.id);
                    const bIndex = orderMap.get(b.id);
                    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
                    if (aIndex !== undefined) return 1; // b is new, comes first
                    if (bIndex !== undefined) return -1; // a is new, comes first
                    return (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0); // both are new
                });
            };

            if (currentView.type === 'feed' && articles.length > 0 && articles.some(a => a.order !== undefined)) {
                return [...articles].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
            }
            if (currentView.type === 'history') {
                return [...articles].sort((a, b) => (readArticleIds.get(b.id) || 0) - (readArticleIds.get(a.id) || 0));
            }
            if (currentView.type === 'readLater') {
                return sortByCustomOrder(readLaterOrder);
            }
            if (currentView.type === 'tag') {
                const order = tagOrders[currentView.value];
                if (order) return sortByCustomOrder(order);
            }
            if (currentView.type === 'favorites') {
                return sortByCustomOrder(favoritesOrder);
            }
            return [...articles].sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));
        };
        const processedArticles = sortArticles(needsDeduplication ? deduplicateArticles(rawArticles) : rawArticles);

        const viewsWithTagFilter = ['favorites', 'published-today', 'readLater', 'history'];
        let availableTags = new Set<string>();

        if (viewsWithTagFilter.includes(currentView.type)) {
            processedArticles.forEach(article => {
                if (article.tags) article.tags.forEach(tag => availableTags.add(tag));
            });
        }
        
        let finalArticles = processedArticles;
        if (viewsWithTagFilter.includes(currentView.type) && activeTagFilter) {
            finalArticles = processedArticles.filter(article => article.tags?.includes(activeTagFilter));
        }
        
        return {
            articlesToShow: finalArticles,
            availableTagsForFilter: Array.from(availableTags).sort()
        };
    }, [currentView, feedsById, allArticles, readLaterArticleIds, readArticleIds, articlesById, favoriteFeeds, activeTagFilter, readLaterOrder, tagOrders, favoritesOrder]);

    const unreadVisibleCount = useMemo(() => articlesToShow.filter(a => !readArticleIds.has(a.id)).length, [articlesToShow, readArticleIds]);
    const headerTitle = useMemo(() => {
        switch (currentView.type) {
            case 'feed': return feedsById.get(currentView.value || '')?.title || 'Feed';
            case 'search': return `Search: "${currentView.value}"`;
            case 'readLater': return 'Read Later';
            case 'history': return 'History';
            case 'favorites': return 'Favorites';
            case 'tag': return `#${currentView.value}`;
            case 'published-today': return 'Published Today';
            case 'all-subscriptions': return 'All Subscriptions';
            case 'inactive-feeds': return 'Inactive Feeds';
            case 'dump': return 'URL Dump';
            case 'privacy-policy': return 'Privacy Policy';
            case 'about': return 'About Media-Feeder';
            default: return 'Media-Feeder';
        }
    }, [currentView, feedsById]);
    const emptyMessage = useMemo(() => {
        if (isViewLoading) return 'Loading...';
        if (activeTagFilter) return `No articles match the tag "${activeTagFilter}".`;
        switch (currentView.type) {
            case 'feed': return 'No articles in this feed.';
            case 'search': return 'No articles found for your search.';
            case 'readLater': return 'You have no articles saved for later.';
            case 'history': return 'Your reading history is empty.';
            case 'favorites': return 'No articles in your favorite feeds.';
            case 'tag': return 'No articles found for this tag.';
            case 'published-today': return 'No articles published today.';
            default: return 'No articles to display.';
        }
    }, [currentView, isViewLoading, activeTagFilter]);
    
    const canZoomIn = useMemo(() => ZOOM_LEVELS.indexOf(gridZoomLevel) < ZOOM_LEVELS.length - 1, [gridZoomLevel]);
    const canZoomOut = useMemo(() => ZOOM_LEVELS.indexOf(gridZoomLevel) > 0, [gridZoomLevel]);
    const canArticleZoomIn = useMemo(() => ZOOM_LEVELS.indexOf(articleZoomLevel) < ZOOM_LEVELS.length - 1, [articleZoomLevel]);
    const canArticleZoomOut = useMemo(() => ZOOM_LEVELS.indexOf(articleZoomLevel) > 0, [articleZoomLevel]);

    // All Callback Handlers
    const handleViewChange = useCallback((type: string, value?: string) => {
        if (isProcessingUrl) return;
        let newHash = `#/${type}`;
        if (value) {
            newHash += `/${encodeURIComponent(value)}`;
        }
        if (window.location.hash !== newHash) {
            window.location.hash = newHash;
        }
    }, [isProcessingUrl]);

    const handleEnterApp = useCallback(() => {
        setHasEnteredApp(true);
    }, []);

    useEffect(() => {
        const initialView = getInitialView();
        const shouldBypassHomepage = initialView.type === 'article' || initialView.type === 'import' || initialView.type === 'privacy-policy' || initialView.type === 'about';
        if (shouldBypassHomepage) {
            setHasEnteredApp(true);
        }
    }, []);

    const handleOpenArticle = useCallback((article: Article) => {
        const newHash = `#/article/${encodeURIComponent(article.feedId)}/${encodeURIComponent(article.id)}`;
        if (window.location.hash !== newHash) {
            window.location.hash = newHash;
        }
    }, []);

    const handleCloseArticleModal = useCallback(() => {
        let newHash = `#/${backgroundView.type}`;
        if (backgroundView.value && typeof backgroundView.value === 'string') {
            newHash += `/${encodeURIComponent(backgroundView.value)}`;
        }
        if (window.location.hash !== newHash) {
            window.location.hash = newHash;
        }
    }, [backgroundView]);

    const articlesForNavigation = useMemo(() => {
        let rawArticles: Article[];
        let needsDeduplication = false;

        switch (backgroundView.type) {
            case 'feed':
                rawArticles = feedsById.get(backgroundView.value || '')?.items || [];
                break;
            case 'search':
                if (!backgroundView.value) rawArticles = [];
                else {
                    const query = backgroundView.value.toLowerCase();
                    rawArticles = allArticles.filter(a => a.title.toLowerCase().includes(query) || a.description.toLowerCase().includes(query));
                }
                needsDeduplication = true;
                break;
            case 'readLater':
                rawArticles = Array.from(readLaterArticleIds).map(id => articlesById.get(id)).filter((a): a is Article => !!a);
                break;
            case 'history':
                rawArticles = Array.from(readArticleIds.keys()).map(id => articlesById.get(id)).filter((a): a is Article => !!a);
                break;
            case 'favorites':
                rawArticles = favoriteFeeds.flatMap(feed => feed.items);
                needsDeduplication = true;
                break;
            case 'tag':
                const tag = backgroundView.value || '';
                rawArticles = allArticles.filter(article => {
                    const feed = feedsById.get(article.feedId);
                    return feed?.tags?.includes(tag) || article.tags?.includes(tag);
                });
                needsDeduplication = true;
                break;
            case 'published-today':
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayTimestamp = today.getTime();
                rawArticles = allArticles.filter(a => a.pubDateTimestamp && a.pubDateTimestamp >= todayTimestamp);
                needsDeduplication = true;
                break;
            default:
                rawArticles = allArticles;
                needsDeduplication = true;
        }

        return (needsDeduplication ? deduplicateArticles(rawArticles) : rawArticles)
            .sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));
    }, [backgroundView, feedsById, allArticles, readLaterArticleIds, readArticleIds, articlesById, favoriteFeeds]);
    
    const articleNavigation = useMemo(() => {
        if (!selectedArticle) return { hasNextArticle: false, hasPreviousArticle: false, onNextArticle: () => {}, onPreviousArticle: () => {} };
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
        const cutoffTimestamp = Date.now() - (inactivePeriod === 'all' ? periodInMs(1) : periodInMs(inactivePeriod));

        return feedsToShowInApp.map(feed => {
            const lastPost = feed.items.reduce((latest, item) => Math.max(latest, item.pubDateTimestamp || 0), 0);
            return { ...feed, lastPostTimestamp: lastPost };
        }).filter((feed: Feed & { lastPostTimestamp: number }) => {
            if (feed.error) return true;
            if (feed.lastPostTimestamp === 0 && feed.items.length > 0) return false;
            if (feed.lastPostTimestamp === 0) return true;
            return feed.lastPostTimestamp < cutoffTimestamp;
        }).sort((a,b) => a.lastPostTimestamp - b.lastPostTimestamp);
    }, [feedsToShowInApp, inactivePeriod]);

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
    const safeSetLocalStorage = useCallback((key: string, value: any) => {
        let stringValue: string | undefined;
        try {
            stringValue = JSON.stringify(value, (_, v) => {
                if (v instanceof Set) return Array.from(v);
                if (v instanceof Map) return Array.from(v.entries());
                return v;
            });
            localStorage.setItem(key, stringValue);
        } catch (e: any) {
            const isQuotaError = e.name === 'QuotaExceededError' || (e.code && (e.code === 22 || e.code === 1014));
            if (isQuotaError) {
                if (stringValue) {
                    const dataSize = (stringValue.length * 2) / 1024 / 1024; // Approx size in MB
                    const totalSize = calculateStorageSize();
                    
                    console.groupCollapsed(
                        `%c[STORAGE DEBUG] Quota Exceeded at ${new Date().toLocaleTimeString()}`,
                        'color: #f59e0b; font-weight: bold;' // yellow-500 color
                    );
                    console.warn('The "Storage full" warning was triggered. This is a debug report.');
                    console.log(
                        `%cExplanation:%c The browser's storage limit (often ~5MB) applies to the size of each individual save operation, not just the total data already stored. This error was triggered because the data chunk being saved was too large for the available space.`,
                        'font-weight: bold;', ''
                    );
                    console.log(`%cKey being saved:%c ${key}`, 'font-weight: bold;', '');
                    console.log(`%cSize of this operation:%c ~${dataSize.toFixed(2)} MB`, 'font-weight: bold;', '');
                    console.log(`%cEstimated total storage before save:%c ${totalSize}`, 'font-weight: bold;', '');
                    console.log('%cAction taken:%c Clearing articles cache and retrying the save.', 'font-weight: bold;', '');
                    console.groupEnd();
            
                } else {
                     console.warn(`[STORAGE DEBUG] Quota Exceeded for key "${key}", but could not calculate operation size. This can happen if JSON.stringify itself fails on a very large object.`);
                }
                
                localStorage.removeItem(ARTICLES_CACHE_KEY);
                // setToast({ message: "Storage full. Cleared articles cache to make space.", type: 'success' });
                try {
                    // stringValue should be defined from the first try block.
                    if (stringValue) {
                        localStorage.setItem(key, stringValue);
                    } else {
                        // This is a fallback in case stringValue was never assigned.
                        localStorage.setItem(key, JSON.stringify(value, (_, v) => {
                            if (v instanceof Set) return Array.from(v);
                            if (v instanceof Map) return Array.from(v.entries());
                            return v;
                        }));
                    }
                } catch (retryError: any) {
                    console.error(`[STORAGE DEBUG] Failed to set localStorage item for "${key}" even after clearing cache:`, retryError);
                }
            } else {
                console.error(`An unexpected error occurred with localStorage for key "${key}":`, e);
                throw e;
            }
        }
    }, [calculateStorageSize]);
    
    const handleProxyAttempt = useCallback((proxyName: string, status: 'success' | 'failure', feedType: FeedType) => {
        setProxyStats((prev: ProxyStats) => {
            const newStats = JSON.parse(JSON.stringify(prev));
            if (!newStats[proxyName]) {
                newStats[proxyName] = { youtube: { success: 0, failure: 0 }, rss: { success: 0, failure: 0 } };
            }
            if (!newStats[proxyName][feedType]) {
                newStats[proxyName][feedType] = { success: 0, failure: 0 };
            }
            newStats[proxyName][feedType][status]++;
            return newStats;
        });
    }, []);
    const updateArticlesCache = useCallback((updatedFeeds: Feed[]) => {
        try {
            const cache = getStoredData<Record<string, Article[]>>(ARTICLES_CACHE_KEY, {});
            updatedFeeds.forEach(feed => {
                if (feed.isPlaylist) {
                    const sortedItems = [...feed.items]
                        .sort((a: Article, b: Article) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0))
                        .slice(0, ARTICLES_CACHE_LIMIT);
                    cache[feed.id] = sortedItems;
                } else {
                    const unreadItems = feed.items.filter((item: Article) => !readArticleIds.has(item.id));
                    const sortedAndLimitedItems = unreadItems
                        .sort((a: Article, b: Article) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0))
                        .slice(0, ARTICLES_CACHE_LIMIT);
                    cache[feed.id] = sortedAndLimitedItems;
                }
            });
            safeSetLocalStorage(ARTICLES_CACHE_KEY, cache);
        } catch (e) {
            console.error('Failed to save articles cache to localStorage:', e);
        }
    }, [readArticleIds, safeSetLocalStorage]);
    const handleClearProxyStats = useCallback(() => { setProxyStats({}); setToast({ message: "Network statistics have been cleared.", type: 'success' }); }, [setToast]);
    const handleToggleProxy = useCallback((proxyName: string, feedType: FeedType) => {
        setDisabledProxies(prev => {
            const compositeKey = `${proxyName}_${feedType}`;
            const newSet = new Set(prev);
            const action = newSet.has(compositeKey) ? 'enabled' : 'disabled';
            
            if (action === 'enabled') {
                newSet.delete(compositeKey);
            } else {
                newSet.add(compositeKey);
            }
            
            setToast({ message: `${proxyName} proxy ${action} for ${feedType.toUpperCase()} feeds.`, type: 'success' });
            return newSet;
        });
    }, [setToast]);
    
    const handleGoogleSignIn = useCallback((options?: { showConsentPrompt?: boolean, isSilent?: boolean }) => {
        if (tokenClientRef.current) {
            // 'none' for silent, 'consent' for explicit, '' for default GSI behavior.
            const prompt = options?.isSilent ? 'none' : (options?.showConsentPrompt ? 'consent' : '');
            tokenClientRef.current.requestAccessToken({ prompt });
        }
    }, []);

    const handleGoogleSignOut = useCallback(() => {
        if (accessToken) {
            // Revoke is best-effort. Don't block UI updates on it.
            google.accounts.oauth2.revoke(accessToken, () => {
                console.log('[DEBUG] Google token revoked.');
            });
        }
        setAccessToken(null);
        setUserProfile(null);
        localStorage.removeItem('gapi_access_token');
        localStorage.removeItem('gapi_access_token_expires_at');
        localStorage.removeItem('gapi_user_profile');
        setToast({ message: "You have been signed out.", type: 'success' });
    }, [accessToken, setToast]);

    const batchRefreshHandler = useCallback(async (feedsToRefresh: Feed[], viewTitle: string) => {
        if (feedsToRefresh.length === 0) {
            setToast({ message: `No feeds to refresh in ${viewTitle}.`, type: 'error' });
            return;
        }
    
        setIsRefreshingAll(true);
        setRefreshProgress(1);

        setToast({ message: `Refreshing ${viewTitle}...`, type: 'success' });
        
        try {
            const totalFeeds = feedsToRefresh.length;
            let processedCount = 0;
            let totalFailedCount = 0;
    
            const processBatchResults = (results: { status: 'fulfilled' | 'rejected', value?: Feed, reason?: any, originalFeed: Feed }[]) => {
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

                        // Correctly merge new articles, preserving custom order of existing ones.
                        const existingArticles = new Map(originalFeed.items.map(a => [a.id, a]));
                        const newArticles = newFeedData.items.filter(a => !existingArticles.has(a.id));
                        const combinedArticles = [...newArticles, ...originalFeed.items];
                        const deduplicatedArticles = Array.from(new Map(combinedArticles.map(a => [a.id, a])).values());
                        
                        successfulFeeds.push({
                            ...newFeedData,
                            id: originalFeed.id,
                            url: originalFeed.url,
                            items: deduplicatedArticles,
                            isFavorite: originalFeed.isFavorite,
                            tags: originalFeed.tags,
                            maxArticles: originalFeed.maxArticles,
                            iconUrl: newFeedData.iconUrl || originalFeed.iconUrl,
                            error: null,
                        });
                    } else {
                        const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
                        failedFeeds.push({ ...originalFeed, error });
                    }
                });
    
                setFeeds(currentFeeds => {
                    const updatedFeedsMap = new Map(currentFeeds.map(f => [f.id, f]));
                    successfulFeeds.forEach(f => updatedFeedsMap.set(f.id, f));
                    failedFeeds.forEach(f => {
                        const existing = updatedFeedsMap.get(f.id);
                        if(existing) updatedFeedsMap.set(f.id, { ...existing, error: f.error });
                    });
                    return Array.from(updatedFeedsMap.values());
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
        
                const promises = chunk.map(async (feed) => {
                    try {
                        if (feed.isPlaylist) {
                            let playlistFeed: Feed | null = null;
                            if (accessToken) {
                                try {
                                    const playlistId = new URL(feed.url).searchParams.get('list');
                                    if (!playlistId) throw new Error("Invalid playlist URL.");
                                    playlistFeed = await fetchPlaylistAsFeed(playlistId, accessToken);
                                } catch (reason: any) {
                                    if (!reason.isAuthError) throw reason; // Re-throw non-auth errors
                                    console.warn(`Auth error for playlist ${feed.title}, falling back to public RSS in batch refresh.`);
                                    playlistFeed = null;
                                }
                            }
                            if (!playlistFeed) {
                                playlistFeed = await fetchAndParseRss(feed.url, feed.title, handleProxyAttempt, disabledProxies, proxyStats, feed.maxArticles);
                            }
                            return { status: 'fulfilled' as const, value: playlistFeed, originalFeed: feed };
                        } else {
                            const rssFeed = await fetchAndParseRss(feed.url, feed.title, handleProxyAttempt, disabledProxies, proxyStats, feed.maxArticles);
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
                setToast({ message: `Refresh complete. ${successCount} succeeded, ${totalFailedCount} failed.`, type: 'error' });
            } else {
                setToast({ message: `Refresh complete. All ${successCount} feeds updated.`, type: 'success' });
            }
    
        } catch (e) {
            const error = e instanceof Error ? e.message : 'An unknown error occurred.';
            setToast({ message: `An unexpected error occurred during refresh: ${error}`, type: 'error' });
        } finally {
            setIsRefreshingAll(false);
            setRefreshProgress(null);
        }
    }, [setToast, updateArticlesCache, handleProxyAttempt, disabledProxies, proxyStats, refreshBatchSize, refreshDelaySeconds, accessToken]);
    
    const handleRefreshSingleFeed = useCallback(async (feedId: string) => {
        const feedToRefresh = feeds.find(f => f.id === feedId);
        if (!feedToRefresh) return;
    
        setRefreshingFeedId(feedId);
        try {
            let newFeedData: Feed | null = null;

            if (feedToRefresh.isPlaylist) {
                if (accessToken) {
                    try {
                        const playlistId = new URL(feedToRefresh.url).searchParams.get('list');
                        if (!playlistId) throw new Error("Invalid YouTube playlist URL for refresh.");
                        newFeedData = await fetchPlaylistAsFeed(playlistId, accessToken);
                    } catch (e: any) {
                        if (e.isAuthError) {
                            console.warn("Auth token is invalid, falling back to public RSS for playlist refresh.");
                            newFeedData = null;
                        } else {
                            throw e; // Re-throw other errors
                        }
                    }
                }
                if (!newFeedData) {
                    newFeedData = await fetchAndParseRss(feedToRefresh.url, feedToRefresh.title, handleProxyAttempt, disabledProxies, proxyStats, feedToRefresh.maxArticles);
                }
            } else {
                 newFeedData = await fetchAndParseRss(feedToRefresh.url, feedToRefresh.title, handleProxyAttempt, disabledProxies, proxyStats, feedToRefresh.maxArticles);
            }
            
            if (newFeedData.items.length === 0 && feedToRefresh.items && feedToRefresh.items.length > 0) {
                throw new Error("Refresh failed: The source returned an empty feed. Old articles have been kept.");
            }
            
            // Merge new articles while preserving existing ones and their custom order.
            const existingArticles = new Map(feedToRefresh.items.map(a => [a.id, a]));
            const newArticles = newFeedData.items.filter(a => !existingArticles.has(a.id));
            const combinedArticles = [...newArticles, ...feedToRefresh.items];
            const deduplicatedArticles = Array.from(new Map(combinedArticles.map(a => [a.id, a])).values());

            const updatedFeed: Feed = {
                ...newFeedData,
                id: feedToRefresh.id,
                url: feedToRefresh.url,
                items: deduplicatedArticles,
                isFavorite: feedToRefresh.isFavorite,
                tags: feedToRefresh.tags,
                maxArticles: feedToRefresh.maxArticles,
                iconUrl: newFeedData.iconUrl || feedToRefresh.iconUrl,
                error: null,
            };

            setFeeds(currentFeeds => {
                return currentFeeds.map(f => f.id === feedId ? updatedFeed : f);
            });
    
            updateArticlesCache([updatedFeed]);
    
            setToast({ message: `Refreshed "${updatedFeed.title}"`, type: 'success' });
    
        } catch (e: any) {
            const error = e instanceof Error ? e.message : 'An unknown error occurred.';
            setFeeds(currentFeeds => currentFeeds.map(f => f.id === feedId ? { ...f, error } : f));
            setToast({ message: `Failed to refresh "${feedToRefresh.title}": ${error}`, type: 'error' });
        } finally {
            setRefreshingFeedId(null);
        }
    }, [feeds, accessToken, updateArticlesCache, handleProxyAttempt, disabledProxies, proxyStats, setToast]);

    const handleRefreshAllFeeds = useCallback(async () => {
        await batchRefreshHandler(feedsToShowInApp, 'all subscriptions');
    }, [batchRefreshHandler, feedsToShowInApp]);

    const handleRefreshFavorites = useCallback(async () => {
        const favoriteFeedsToRefresh = feeds.filter(f => f.isFavorite);
        await batchRefreshHandler(favoriteFeedsToRefresh, 'favorite feeds');
    }, [batchRefreshHandler, feeds]);
    const handleRefreshTaggedFeeds = useCallback(async () => {
        const taggedFeeds = feeds.filter(f => f.tags && f.tags.length > 0);
        await batchRefreshHandler(taggedFeeds, 'tagged feeds');
    }, [batchRefreshHandler, feeds]);
    const handleRefreshMissingIcons = useCallback(async () => {
        const feedsToRefresh = feeds.filter(f => 
            f.url.includes('youtube.com') && !f.iconUrl
        );
        if (feedsToRefresh.length === 0) {
            setToast({ message: "No YouTube feeds with missing icons found.", type: 'success' });
            return;
        }
        await batchRefreshHandler(feedsToRefresh, `${feedsToRefresh.length} feeds with missing icons`);
    }, [batchRefreshHandler, feeds, setToast]);
    const handleSelectFeed = useCallback((feedId: string) => {
        handleViewChange('feed', feedId);
    }, [handleViewChange]);

    const handleImportData = useCallback((data: SyncData) => {
        try {
            if (!data || !Array.isArray(data.feeds)) {
                throw new Error("Data is missing 'feeds' array or is not in the correct format.");
            }

            // 1. Clear all existing article-related data to prepare for a clean import of content.
            setReadArticleIds(new Map());
            setReadLaterArticleIds(new Set());
            setLikedVideoIds(new Set());
            setArticleTags(new Map());
            setReadLaterOrder([]);
            setTagOrders({});
            setFavoritesOrder([]);

            // 2. Merge feed subscriptions and settings, but replace articles.
            let newFeedsCount = 0;
            const currentFeedsMap = new Map(feeds.map(f => [f.url, f]));

            // Clear articles from existing feeds.
            currentFeedsMap.forEach(feed => {
                feed.items = [];
            });

            data.feeds.forEach(importedFeed => {
                const existingFeed = currentFeedsMap.get(importedFeed.url);
                const feedId = existingFeed ? existingFeed.id : importedFeed.url;

                // Articles will be populated from the backup file's dedicated article list.
                const articlesFromBackup = (data.articlesByFeedUrl?.[importedFeed.url] || []).map((art: Article) => ({
                    ...art,
                    feedId: art.feedId || feedId 
                }));

                if (existingFeed) {
                    // Feed exists: update its settings and replace its articles.
                    const updatedFeed: Feed = {
                        ...existingFeed, // Keep existing ID, etc.
                        ...importedFeed, // Overwrite with imported settings like title, tags, favorite status.
                        items: articlesFromBackup, // Replace articles entirely.
                        error: null,
                    };
                    currentFeedsMap.set(updatedFeed.url, updatedFeed);
                } else {
                    // This is a new feed.
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

            // 3. Restore article-related data from the imported file.
            if (data.readLaterArticleIds) {
                setReadLaterArticleIds(new Set(data.readLaterArticleIds));
            }
            if (data.readLaterOrder) {
                setReadLaterOrder(data.readLaterOrder);
            }
            if (data.readArticleIds) {
                setReadArticleIds(new Map(data.readArticleIds));
            }
            if (data.likedVideoIds) {
                setLikedVideoIds(new Set(data.likedVideoIds));
            }
            if (data.articleTags) {
                setArticleTags(new Map(data.articleTags));
            }
            if (data.tagOrders) {
                setTagOrders(data.tagOrders);
            }
            if (data.favoritesOrder) {
                setFavoritesOrder(data.favoritesOrder);
            }

            // 4. Restore general app settings.
            if (data.gridZoomLevel) setGridZoomLevel(data.gridZoomLevel);
            if (data.articleZoomLevel) setArticleZoomLevel(data.articleZoomLevel);
            if (data.autoplayMode) setAutoplayMode(data.autoplayMode);

            setFeeds(Array.from(currentFeedsMap.values()));

            // 5. Provide feedback to the user.
            if (newFeedsCount > 0) {
                setToast({ message: `Successfully imported data, replacing existing content. Added ${newFeedsCount} new feeds.`, type: 'success' });
            } else {
                setToast({ message: 'Data imported successfully, replacing existing content. No new feeds were found.', type: 'success' });
            }
            
            // After a successful import, navigate to the main view to prevent re-importing from the URL hash.
            if (currentView.type === 'import') {
                handleViewChange('all-subscriptions');
            }

        } catch (e) {
            const message = e instanceof Error ? e.message : "An unknown error occurred during import.";
            setToast({ message: `Import failed: ${message}`, type: 'error' });
            throw e;
        }
    }, [
        feeds,
        setFeeds, setReadArticleIds, setReadLaterArticleIds, setLikedVideoIds, setArticleTags,
        setReadLaterOrder, setTagOrders, setFavoritesOrder,
        setGridZoomLevel, setArticleZoomLevel, setAutoplayMode, setToast,
        currentView, handleViewChange
    ]);

    const addRecentShareCode = useCallback((code: string) => {
        setRecentShareCodes(prevCodes => {
            const filteredCodes = prevCodes.filter(c => c !== code);
            const newCodes = [code, ...filteredCodes];
            return newCodes.slice(0, 3);
        });
    }, []);

    const handleCancelAddVideoOrChannel = useCallback(() => {
        setVideoToAdd(null);
    }, []);

    const handleConfirmAddChannel = useCallback(async (channelUrl: string, channelTitle: string) => {
        setVideoToAdd(null);
        setAddFeedModalOpen(true);
        try {
            const newFeed = await fetchAndParseRss(channelUrl, channelTitle, handleProxyAttempt, disabledProxies, proxyStats, 5);
            const isDuplicate = feeds.some(f => f.id === newFeed.id);
            if (isDuplicate) {
                setToast({ message: "This channel is already in your subscriptions.", type: 'error' });
                return;
            }
            const feedToAdd: Feed = { ...newFeed, error: null };
            setFeeds(prevFeeds => [...prevFeeds, feedToAdd]);
            updateArticlesCache([feedToAdd]);
            handleSelectFeed(feedToAdd.id);
            setToast({ message: `Added "${feedToAdd.title}".`, type: 'success' });
            setFeedToEditTags(feedToAdd);
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to add channel.";
            setToast({ message, type: 'error' });
        } finally {
            setAddFeedModalOpen(false);
        }
    }, [feeds, handleProxyAttempt, disabledProxies, proxyStats, updateArticlesCache, handleSelectFeed, setToast, setFeedToEditTags]);

    const handleConfirmAddSingleVideo = useCallback(async (videoArticle: Article) => {
        setVideoToAdd(null);
        try {
            const existingFeed = feeds.find(f => f.id === videoArticle.feedId);
            if (existingFeed) {
                const articleExists = existingFeed.items.some(item => item.id === videoArticle.id);
                if (articleExists) {
                    setToast({ message: "This video is already in your feed for this channel.", type: 'error' });
                    return;
                }
                setFeeds(currentFeeds => currentFeeds.map(f => {
                    if (f.id === videoArticle.feedId) {
                        const updatedItems = [videoArticle, ...f.items].sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));
                        return { ...f, items: updatedItems };
                    }
                    return f;
                }));
                setToast({ message: `Added "${videoArticle.title}" to "${videoArticle.feedTitle}".`, type: 'success' });
            } else {
                const newFeed: Feed = {
                    id: videoArticle.feedId, url: videoArticle.feedId, title: videoArticle.feedTitle,
                    items: [videoArticle], error: null, iconUrl: videoArticle.imageUrl, maxArticles: 5
                };
                setFeeds(prevFeeds => [...prevFeeds, newFeed]);
                updateArticlesCache([newFeed]);
                handleSelectFeed(newFeed.id);
                setToast({ message: `Added "${videoArticle.title}" and created a feed for "${newFeed.title}".`, type: 'success' });
            }

            // Automatically add "Videos" tag to the newly added article.
            setArticleTags(prev => {
                const newMap = new Map(prev);
                const existingTags = newMap.get(videoArticle.id) || [];
                const newTags = Array.from(new Set([...existingTags, "Videos"])).sort();
                newMap.set(videoArticle.id, newTags);
                return newMap;
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to add video.";
            setToast({ message, type: 'error' });
        }
    }, [feeds, updateArticlesCache, handleSelectFeed, setToast, setArticleTags]);

    const handleAddFeed = useCallback(async (rawUrl: string, maxArticles: number, options?: { headless?: boolean }): Promise<Feed | void> => {
        let url = rawUrl.trim();
        const shortCodeRegex = /^[a-zA-Z0-9]+$/;
        const oldImportUrlRegex = /#\/import=([a-zA-Z0-9]+)/;
        const newImportUrlRegex = /#\/import\/([a-zA-Z0-9]+)/;
    
        const oldMatch = url.match(oldImportUrlRegex);
        const newMatch = url.match(newImportUrlRegex);
    
        if (oldMatch && oldMatch[1]) {
            url = oldMatch[1]; // Extract from old format
        } else if (newMatch && newMatch[1]) {
            url = newMatch[1]; // Extract from new format
        }

        const handleSharedDataImport = async (content: string) => {
            let importedData;
            if (content.startsWith('media-feeder-compressed:v2:')) {
                const compressedData = content.substring('media-feeder-compressed:v2:'.length);
                const decompressed = LZString.decompressFromBase64(compressedData);
                if (decompressed) {
                    importedData = JSON.parse(decompressed);
                } else {
                    throw new Error("Failed to decompress data from the link.");
                }
            } else {
                 throw new Error("This share link uses an old, unsupported compression format. Please generate a new link.");
            }

            handleImportData(importedData);
            setToast({ message: "Successfully imported data from share link/code.", type: 'success' });
        };
        
        try {
            if (shortCodeRegex.test(url) && !url.includes('{') && !url.includes('.')) {
                const rawContentUrl = `https://dpaste.org/${url}/raw`;
                let content: string;
                try {
                    console.log(`[DEBUG] Attempting direct fetch from ${rawContentUrl}`);
                    const response = await fetch(rawContentUrl);
                    if (!response.ok) {
                        throw new Error(`Direct fetch failed with status ${response.status}`);
                    }
                    content = await response.text();
                    console.log(`[DEBUG] Direct fetch successful.`);
                } catch (directFetchError) {
                    console.warn(`[DEBUG] Direct fetch failed: ${directFetchError}. Falling back to proxy.`);
                    content = await fetchViaProxy(rawContentUrl, 'rss');
                }
                await handleSharedDataImport(content);
                addRecentShareCode(url);
                return;
            }

        } catch (e) {
            const message = e instanceof Error ? e.message : "An unknown error occurred.";
            throw new Error(`Import from shared link/code failed: ${message}`);
        }
        
        if (url.includes('pastebin.com')) {
            try {
                const jsonContent = await fetchContentFromPastebinUrl(url);
                const importedData = JSON.parse(jsonContent);

                let feedsToImport: Omit<Feed, 'id' | 'items' | 'error'>[] = [];

                if (importedData && Array.isArray(importedData.feeds)) {
                    feedsToImport = importedData.feeds;
                } else if (Array.isArray(importedData)) {
                    feedsToImport = importedData;
                } else {
                    throw new Error("Pasted content is not a valid backup or channel list format.");
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
                    setToast({ message: `Successfully imported ${newFeeds.length} new feeds from Pastebin.`, type: 'success' });
                } else {
                    setToast({ message: 'All channels from the Pastebin link are already subscribed.', type: 'success' });
                }
                return;
            } catch (e) {
                const message = e instanceof Error ? e.message : "An unknown error occurred.";
                throw new Error(`Import from Pastebin failed: ${message}`);
            }
        }
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `https://${url}`;
        }
        
        const isYouTubeVideo = (url.includes('youtube.com/watch?v=') || url.includes('youtu.be/')) && !url.includes('list=');

        if (isYouTubeVideo && !options?.headless) {
            try {
                const videoId = getYouTubeId(url);
                if (videoId) {
                    const videoArticle = await fetchSingleYouTubeVideoAsArticle(videoId);
                    setVideoToAdd(videoArticle);
                    setAddFeedModalOpen(false); // Close the original modal
                    return;
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : "Could not process YouTube video link.";
                throw new Error(message);
            }
        }

        console.log('[DEBUG] handleAddFeed: Processing URL:', url);
        
        let newFeed: Feed | null = null;
        const isPlaylist = url.includes('youtube.com') && new URL(url).searchParams.has('list');

        if (isPlaylist) {
            if (accessToken) {
                try {
                    const playlistId = new URL(url).searchParams.get('list');
                    if (!playlistId) throw new Error("Invalid YouTube playlist URL.");
                    newFeed = await fetchPlaylistAsFeed(playlistId, accessToken);
                } catch (e: any) {
                    if (e.isAuthError) {
                        console.warn("Auth token is invalid, falling back to public RSS for adding playlist.");
                        newFeed = null;
                    } else {
                        throw e; // Re-throw other errors
                    }
                }
            }
            if (!newFeed) {
                newFeed = await fetchAndParseRss(url, undefined, handleProxyAttempt, disabledProxies, proxyStats, maxArticles);
            }
        } else {
            newFeed = await fetchAndParseRss(url, undefined, handleProxyAttempt, disabledProxies, proxyStats, maxArticles);
        }
        
        console.log('[DEBUG] handleAddFeed: Generated Canonical ID:', newFeed.id);
        const isDuplicate = feeds.some(f => f.id === newFeed.id);
        console.log('[DEBUG] handleAddFeed: Is Duplicate?', isDuplicate);
    
        if (isDuplicate) {
            throw new Error("This feed is already in your subscriptions.");
        }
    
        let feedToAdd: Feed = { ...newFeed, error: null };
    
        setFeeds(prevFeeds => [...prevFeeds, feedToAdd]);
        updateArticlesCache([feedToAdd]);
    
        if (!options?.headless) {
            handleSelectFeed(feedToAdd.id);
            setToast({ message: `Added "${feedToAdd.title}". Now add some tags.`, type: 'success' });
            setFeedToEditTags(feedToAdd);
        }
        return feedToAdd;
    }, [feeds, accessToken, handleProxyAttempt, disabledProxies, proxyStats, handleSelectFeed, updateArticlesCache, setToast, setFeedToEditTags, handleImportData, addRecentShareCode, setVideoToAdd, setAddFeedModalOpen]);

    const handleAddFromRecommendation = useCallback(async (url: string, title: string, inheritedTags: string[] = []) => {
        console.log('[DEBUG] handleAddFromRecommendation: Processing URL:', url);

        const newFeedData = await fetchAndParseRss(url, title, handleProxyAttempt, disabledProxies, proxyStats, 5);
        
        console.log('[DEBUG] handleAddFromRecommendation: Generated Canonical ID:', newFeedData.id);
        const isDuplicate = feeds.some(f => f.id === newFeedData.id);
        console.log('[DEBUG] handleAddFromRecommendation: Is Duplicate?', isDuplicate);
    
        if (isDuplicate) {
            throw new Error(`"${newFeedData.title}" is already in your subscriptions.`);
        }
    
        let feedToAdd: Feed = {
            ...newFeedData,
            tags: inheritedTags.length > 0 ? inheritedTags : undefined,
            error: null,
        };
    
        setFeeds(prevFeeds => [...prevFeeds, feedToAdd]);
        updateArticlesCache([feedToAdd]);
    
        setToast({ message: `Added "${feedToAdd.title}". Now add some tags.`, type: 'success' });
        setFeedToEditTags(feedToAdd);
    }, [feeds, handleProxyAttempt, disabledProxies, proxyStats, setToast, updateArticlesCache, setFeedToEditTags]);
    const handleDeleteFeed = useCallback((feedId: string) => {
        const feedToDelete = feeds.find(f => f.id === feedId);
        if (feedToDelete && window.confirm(`Are you sure you want to delete the feed "${feedToDelete.title}"?`)) {
            setFeeds(prevFeeds => prevFeeds.filter(f => f.id !== feedId));
            if (currentView.type === 'feed' && currentView.value === feedId) {
                handleViewChange('all-subscriptions');
            }
            setToast({ message: `Deleted "${feedToDelete.title}"`, type: 'success' });
        }
    }, [feeds, currentView, handleViewChange, setToast]);
    const handleBulkDeleteFeeds = useCallback((feedIds: Set<string>) => {
        if (window.confirm(`Are you sure you want to delete ${feedIds.size} selected feeds?`)) {
            setFeeds(prevFeeds => prevFeeds.filter(f => !feedIds.has(f.id)));
            if (currentView.type === 'feed' && currentView.value && feedIds.has(currentView.value)) {
                handleViewChange('all-subscriptions');
            }
            setToast({ message: `Deleted ${feedIds.size} feeds.`, type: 'success' });
        }
    }, [feeds, currentView, handleViewChange, setToast]);
    const handleToggleFavorite = useCallback((feedId: string) => {
        setFeeds(prevFeeds => prevFeeds.map(f => f.id === feedId ? { ...f, isFavorite: !f.isFavorite } : f));
    }, []);
    const handleSaveFeedTitle = useCallback((feedId: string, title: string) => {
        setFeeds(prevFeeds => prevFeeds.map(f => f.id === feedId ? { ...f, title } : f));
    }, []);
    const handleSaveFeedMaxArticles = useCallback((feedId: string, maxArticles: number) => {
        setFeeds(prevFeeds => prevFeeds.map(f => f.id === feedId ? { ...f, maxArticles } : f));
    }, []);
    const handleSaveFeedTags = useCallback((feedId: string, tags: string[]) => {
        setFeeds(prevFeeds => prevFeeds.map(f => f.id === feedId ? { ...f, tags: tags.length > 0 ? tags : undefined } : f));
    }, []);
    const handleToggleReadStatus = useCallback((articleId: string) => {
        setReadArticleIds(prev => {
            const newMap = new Map(prev);
            if (newMap.has(articleId)) newMap.delete(articleId); else newMap.set(articleId, Date.now());
            return newMap;
        });
    }, []);
    const handleToggleReadLater = useCallback((articleId: string) => {
        setReadLaterArticleIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(articleId)) {
                newSet.delete(articleId);
                setToast({ message: 'Removed from Read Later.', type: 'success' });
                setReadLaterOrder(currentOrder => currentOrder.filter(id => id !== articleId));
            } else {
                newSet.add(articleId);
                setToast({ message: 'Saved to Read Later.', type: 'success' });
                setReadLaterOrder(currentOrder => [articleId, ...currentOrder]);
            }
            return newSet;
        });
    }, [setToast]);
    const handleSummaryGenerated = useCallback((articleId: string, summary: string | StructuredVideoSummary, sources?: WebSource[]) => {
        const updateArticle = (article: Article) => {
            if (typeof summary === 'string') {
                return { ...article, summary, sources: sources || [] };
            }
            return { ...article, structuredSummary: summary, sources: sources || [] };
        };
    
        setFeeds(prevFeeds =>
            prevFeeds.map(feed => ({
                ...feed,
                items: feed.items.map(item => item.id === articleId ? updateArticle(item) : item),
            }))
        );
    
        setSelectedArticle(prevArticle => prevArticle?.id === articleId ? updateArticle(prevArticle) : prevArticle);
    }, []);
    const handleGenerateDigest = useCallback(() => {
        if (selectedArticleIdsForBatch.size === 0) {
            setToast({ message: 'Please select one or more videos to create a digest from.', type: 'error' });
            return;
        }
        
        const selectedArticles = Array.from(selectedArticleIdsForBatch)
            .map(id => articlesById.get(id))
            .filter((a): a is Article => !!a);

        const videosWithLinks = selectedArticles.filter(a => a.isVideo && a.link);

        if (videosWithLinks.length === 0) {
            setToast({ message: 'None of the selected items are videos that can be summarized.', type: 'error' });
            return;
        }

        // The modal will check for transcripts on all selected videos.
        setArticlesForDigest(videosWithLinks);
        setIsDigestConfigModalOpen(true);
    }, [selectedArticleIdsForBatch, articlesById, setToast]);

    const handleExecuteDigest = useCallback(async (selectedArticles: Article[], targetLanguage: string) => {
        setIsDigestConfigModalOpen(false);
        setInitialDigestLanguage(targetLanguage);

        const videosWithLinks = selectedArticles.filter(a => a.isVideo && a.link);
        if (videosWithLinks.length === 0) {
            setToast({ message: 'No videos were selected to create a digest from.', type: 'error' });
            return;
        }

        setIsDigestModalOpen(true);
        setDigestState({ digest: null, error: null, isLoading: true, loadingMessage: `Finding transcripts for up to ${Math.min(10, videosWithLinks.length)} selected videos...` });

        try {
            const topVideos = videosWithLinks.slice(0, 10);
            const transcriptPromises = topVideos.map(async (article) => {
                const videoId = getYouTubeId(article.link);
                if (!videoId) return null;
                try {
                    const choices = await fetchAvailableCaptionChoices(videoId);
                    if (choices.length === 0) return null;
                    const transcript = await fetchAndParseTranscript(choices[0].url);
                    return { title: article.title, link: article.link!, content: transcript };
                } catch (e) {
                    console.warn(`Could not fetch transcript for ${article.title}:`, e);
                    return null;
                }
            });

            const settledResults = await Promise.allSettled(transcriptPromises);
            const successfulTranscripts = settledResults
                .filter(res => res.status === 'fulfilled' && res.value)
                .map(res => (res as PromiseFulfilledResult<any>).value);
            
            if (successfulTranscripts.length === 0) {
                throw new Error("Could not fetch any transcripts for the selected videos.");
            }

            setDigestState(prev => ({ ...prev, loadingMessage: `Found ${successfulTranscripts.length} transcripts. Generating digest...` }));

            const digestResult = await generateTranscriptDigest(successfulTranscripts, headerTitle, aiModel);
            
            setDigestState({ digest: digestResult, error: null, isLoading: false, loadingMessage: null });

        } catch (e: any) {
            setDigestState({ digest: null, error: e.message || "An unknown error occurred.", isLoading: false, loadingMessage: null });
        }
    }, [headerTitle, aiModel, setToast]);
    const translateDigest = useCallback(async (digest: HistoryDigest, targetLanguage: string): Promise<HistoryDigest> => {
        const { synthesis } = await translateDigestContent(digest, targetLanguage, aiModel);
        return { ...digest, synthesis };
    }, [aiModel]);
    const handleGenerateRecommendations = useCallback(async (customQuery?: string) => {
        setIsRecommendationsModalOpen(true);
        setRecommendationsState({ recommendations: null, error: null, isLoading: true });
        const historyArticles = Array.from(readArticleIds.keys()).map(id => articlesById.get(id)).filter((a): a is Article => !!a);
        try {
            const response = await generateRecommendations(feeds, historyArticles, aiModel, customQuery);
            const recs = response?.recommendations;
            if (!Array.isArray(recs)) {
                throw new Error("AI returned an unexpected format for recommendations.");
            }
            setRecommendationsState({ recommendations: recs, error: null, isLoading: false });
        } catch (e: any) {
            setRecommendationsState({ recommendations: null, error: e.message, isLoading: false });
        }
    }, [feeds, readArticleIds, articlesById, aiModel]);
    const handleGenerateMoreRecommendations = useCallback(async (customQuery?: string) => {
        setRecommendationsState(prev => ({ ...prev, isLoading: true }));
        const historyArticles = Array.from(readArticleIds.keys()).map(id => articlesById.get(id)).filter((a): a is Article => !!a);
        const existingRecUrls = recommendationsState.recommendations?.map(r => r.url) || [];
        try {
            const response = await generateRecommendations(feeds, historyArticles, aiModel, customQuery, existingRecUrls);
            const newRecs = response?.recommendations;
            if (!Array.isArray(newRecs)) {
                throw new Error("AI returned an unexpected format for recommendations.");
            }
            const uniqueNewRecs = newRecs.filter(rec => !existingRecUrls.includes(rec.url));
            setRecommendationsState(prev => ({
                recommendations: [...(prev.recommendations || []), ...uniqueNewRecs],
                error: null,
                isLoading: false
            }));
        } catch (e: any) {
            setToast({ message: e.message || 'Failed to get more recommendations.', type: 'error' });
            setRecommendationsState(prev => ({ ...prev, isLoading: false }));
        }
    }, [feeds, readArticleIds, articlesById, aiModel, recommendationsState.recommendations, setToast]);
    const handleResetRecommendations = useCallback(() => {
        setRecommendationsState({ recommendations: null, error: null, isLoading: false });
    }, []);
    const handleExportChannelsAsText = useCallback(() => {
        const dataToExport = feeds.map(({ id, items, error, ...rest }) => rest);
        setExportTextContent(JSON.stringify(dataToExport, null, 2));
        setIsExportTextModalOpen(true);
    }, [feeds]);
    const handleExportFeeds = useCallback((options: { favoritesOnly?: boolean; tag?: string; }) => {
        let feedsToExportSource: Feed[] = [];
        let fileName = 'media-feeder-backup';

        if (options.favoritesOnly) {
            feedsToExportSource = feeds.filter(f => f.isFavorite);
            fileName += '-favorites';
        } else if (options.tag) {
            feedsToExportSource = feeds.filter(f => f.tags?.includes(options.tag!));
            fileName += `-tag-${options.tag.toLowerCase().replace(/\s/g, '-')}`;
        } else {
            feedsToExportSource = feeds;
        }
        
        const articlesByUrl: Record<string, Article[]> = {};
        feedsToExportSource.forEach(feed => {
            if (feed.items && feed.items.length > 0) {
                articlesByUrl[feed.url] = feed.items;
            }
        });

        const syncData: SyncData = {
            feeds: feedsToExportSource.map(({ id, items, error, ...rest }) => rest),
            readArticleIds: Array.from(readArticleIds.entries()),
            readLaterArticleIds: Array.from(readLaterArticleIds),
            likedVideoIds: Array.from(likedVideoIds),
            gridZoomLevel,
            articleZoomLevel,
            autoplayMode,
            articleTags: Array.from(articleTags.entries()),
            readLaterOrder,
            tagOrders,
            favoritesOrder,
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(syncData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${fileName}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        setToast({ message: "Feeds exported successfully.", type: "success" });
    }, [feeds, readArticleIds, readLaterArticleIds, likedVideoIds, gridZoomLevel, articleZoomLevel, autoplayMode, articleTags, readLaterOrder, tagOrders, favoritesOrder, setToast]);
    
    const handleShareToCloudLink = useCallback(async (options?: { tag?: string }): Promise<string> => {
        try {
            let feedsToShare = feeds;
            if (options?.tag) {
                feedsToShare = feeds.filter(f => f.tags?.includes(options.tag!));
                if (feedsToShare.length === 0) {
                    throw new Error(`No feeds found with the tag "${options.tag}".`);
                }
            }

            // Create a lightweight backup by including article metadata but omitting bulky text fields.
            const articlesByUrl: Record<string, Article[]> = {};
            feedsToShare.forEach(feed => {
                if (feed.items && feed.items.length > 0) {
                    articlesByUrl[feed.url] = feed.items.map(article => ({
                        ...article,
                        content: '', // Omit heavy content
                        description: '', // Omit heavy description
                        summary: undefined,
                        structuredSummary: undefined,
                        comments: undefined,
                    }));
                }
            });

            const data: SyncData = {
                feeds: feedsToShare.map(({ id, items, error, ...rest }) => rest),
                articlesByFeedUrl: articlesByUrl,
                readArticleIds: Array.from(readArticleIds.entries()),
                readLaterArticleIds: Array.from(readLaterArticleIds),
                likedVideoIds: Array.from(likedVideoIds),
                gridZoomLevel,
                articleZoomLevel,
                autoplayMode,
                articleTags: Array.from(articleTags.entries()),
                readLaterOrder,
                tagOrders,
                favoritesOrder,
            };

            const jsonData = JSON.stringify(data);
            const compressedData = LZString.compressToBase64(jsonData);
            const payload = `media-feeder-compressed:v2:${compressedData}`;
            
            const formData = new FormData();
            formData.append('content', payload);

            const targetUrl = 'https://dpaste.org/api/';
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

            const response = await fetch(proxyUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => `Status ${response.status}`);
                throw new Error(`Failed to create paste: ${errorText}`);
            }

            const pasteUrl = await response.text();
            // New, more robust extraction logic using a regular expression.
            const match = pasteUrl.trim().match(/dpaste\.org\/([a-zA-Z0-9]+)/);
            const code = match ? match[1] : null;

            if (code) {
                addRecentShareCode(code);
                const importUrl = `${window.location.origin}${window.location.pathname}#/import/${code}`;
                return importUrl;
            } else {
                throw new Error(`Sharing service returned an invalid or unexpected response: ${pasteUrl}`);
            }
        } catch (error: any) {
            console.error("Error sharing to cloud link:", error);
            if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
                 throw new Error("Failed to connect to the sharing service. This may be a temporary network issue.");
            }
            throw error;
        }
    }, [feeds, readArticleIds, readLaterArticleIds, likedVideoIds, gridZoomLevel, articleZoomLevel, autoplayMode, articleTags, readLaterOrder, tagOrders, favoritesOrder, addRecentShareCode]);

    const handleOpenClearDataModal = useCallback(() => {
        setIsClearDataModalOpen(true);
    }, []);

    const handleClearArticlesAndHistory = useCallback(() => {
        setFeeds(prevFeeds =>
            prevFeeds.map(feed => ({
                ...feed,
                items: [],
            }))
        );
        setReadArticleIds(new Map());
        setReadLaterArticleIds(new Set());
        setReadLaterOrder([]);
        setToast({ message: "Cleared all articles and history. Your subscriptions have been kept.", type: "success" });
    }, [setToast]);
    
    const handleFactoryReset = useCallback(() => {
        if (window.confirm("FINAL WARNING: Are you sure you want to clear ALL data? This will perform a factory reset, removing all subscriptions, tags, and settings. This cannot be undone.")) {
            localStorage.clear();
            setFeeds([]);
            setReadArticleIds(new Map());
            setReadLaterArticleIds(new Set());
            setLikedVideoIds(new Set());
            setCurrentView({ type: 'all-subscriptions' });
            setToast({ message: "All data has been cleared.", type: "success" });
            window.location.reload();
        }
    }, [setToast]);
    
    const handleSearch = useCallback((query: string) => {
        handleViewChange('search', query);
    }, [handleViewChange]);
    const handleClearSearch = useCallback(() => {
        if (currentView.type === 'search') {
            handleViewChange('all-subscriptions');
        }
    }, [currentView, handleViewChange]);
    const handleClearHistory = useCallback(() => {
        if (window.confirm("Are you sure you want to clear your entire reading history?")) {
            setReadArticleIds(new Map());
            setToast({ message: "Reading history cleared.", type: "success" });
        }
    }, [setToast]);
    const handleClearReadLater = useCallback(() => {
        if (window.confirm("Are you sure you want to clear all articles from your 'Read Later' list?")) {
            setReadLaterArticleIds(new Set());
            setReadLaterOrder([]);
            setToast({ message: "'Read Later' list cleared.", type: "success" });
        }
    }, [setToast]);
    const handleMarkAllInAllFeedsAsRead = useCallback(() => {
        const allIds = feeds.flatMap(f => f.items.map(i => i.id));
        if (allIds.length === readArticleIds.size) {
            setToast({ message: 'All articles are already marked as read.', type: 'success' });
            return;
        }
        if (window.confirm(`Are you sure you want to mark all ${allIds.length} articles in all feeds as read?`)) {
            const newReadIds = new Map(readArticleIds);
            const now = Date.now();
            allIds.forEach(id => newReadIds.set(id, now));
            setReadArticleIds(newReadIds);
            setToast({ message: "All articles have been marked as read.", type: "success" });
        }
    }, [feeds, readArticleIds, setToast]);
    const handleMarkAllRead = useCallback(() => {
        const newReadIds = new Map(readArticleIds);
        const now = Date.now();
        let markedCount = 0;
        articlesToShow.forEach(article => {
            if (!newReadIds.has(article.id)) {
                newReadIds.set(article.id, now);
                markedCount++;
            }
        });
        if (markedCount > 0) setReadArticleIds(newReadIds);
    }, [articlesToShow, readArticleIds]);
    
    const handleMarkSelectedAsRead = useCallback(() => {
        if (selectedArticleIdsForBatch.size === 0) return;

        const newReadIds = new Map(readArticleIds);
        const now = Date.now();
        selectedArticleIdsForBatch.forEach(articleId => {
            newReadIds.set(articleId, now);
        });
        setReadArticleIds(newReadIds);
        setToast({ message: `Marked ${selectedArticleIdsForBatch.size} article(s) as read.`, type: 'success' });
        setSelectedArticleIdsForBatch(new Set()); // Clear selection
    }, [selectedArticleIdsForBatch, readArticleIds, setToast]);

    const handleOpenRelatedModal = useCallback((feedId: string) => {
        setRelatedSourceFeedId(feedId);
        setRelatedChannelsState({ recommendations: null, error: null, isLoading: false });
        setIsRelatedModalOpen(true);
    }, []);
    const handleCloseRelatedModal = useCallback(() => {
        setIsRelatedModalOpen(false);
        setRelatedSourceFeedId(null);
    }, []);
    const handleGenerateRelated = useCallback(async () => {
        if (!relatedSourceFeedId) return;
        const sourceFeed = feeds.find(f => f.id === relatedSourceFeedId);
        if (!sourceFeed) return;

        setRelatedChannelsState({ recommendations: null, error: null, isLoading: true });
        const existingUrls = feeds.map(f => f.url);
        try {
            const response = await generateRelatedChannels(sourceFeed, existingUrls, aiModel);
            const recs = response?.recommendations;
            if (!Array.isArray(recs)) throw new Error("AI returned an unexpected format.");
            setRelatedChannelsState({ recommendations: recs, error: null, isLoading: false });
        } catch (e: any) {
            setRelatedChannelsState({ recommendations: null, error: e.message, isLoading: false });
        }
    }, [relatedSourceFeedId, feeds, aiModel]);
    const handleBulkUpdateTags = useCallback((feedIds: Set<string>, tags: string[], mode: 'add' | 'set' | 'favorite') => {
        setFeeds(prevFeeds => prevFeeds.map(feed => {
            if (feedIds.has(feed.id)) {
                if (mode === 'favorite') {
                    return { ...feed, isFavorite: true };
                }
                const newTags = mode === 'add' ? Array.from(new Set([...(feed.tags || []), ...tags])) : tags;
                return { ...feed, tags: newTags.length > 0 ? newTags.sort() : undefined };
            }
            return feed;
        }));
        const message = mode === 'favorite' ? `Marked ${feedIds.size} feeds as favorites.` : `Updated tags for ${feedIds.size} feeds.`;
        setToast({ message, type: 'success' });
    }, [setToast]);
    const handleOpenBulkEdit = useCallback(() => setBulkEditModalConfig({ isOpen: true, mode: 'add' }), []);
    const handleOpenBulkEditForTag = useCallback((tag: string) => setBulkEditModalConfig({ isOpen: true, mode: 'add', tag }), []);
    const handleOpenBulkEditForFavorites = useCallback(() => setBulkEditModalConfig({ isOpen: true, mode: 'favorite' }), []);
    const onToggleSidebar = useCallback(() => setIsSidebarCollapsed(prev => !prev), []);
    const onToggleViewsCollapse = useCallback(() => setIsViewsCollapsed(prev => !prev), []);
    const onToggleYoutubeFeedsCollapse = useCallback(() => setIsYoutubeFeedsCollapsed(prev => !prev), []);
    const onToggleRssFeedsCollapse = useCallback(() => setIsRssFeedsCollapse(prev => !prev), []);
    const onToggleRedditFeedsCollapse = useCallback(() => setIsRedditFeedsCollapse(prev => !prev), []);
    const onToggleTagsCollapse = useCallback(() => setIsTagsCollapsed(prev => !prev), []);
    const onToggleTagExpansion = useCallback((tag: string) => {
        setExpandedTags(prev => {
            const newSet = new Set(prev);
            newSet.has(tag) ? newSet.delete(tag) : newSet.add(tag);
            return newSet;
        });
    }, []);
    const onToggleFavoritesCollapse = useCallback(() => setIsFavoritesCollapsed(prev => !prev), []);
    const onToggleYoutubePlaylistsCollapse = useCallback(() => setIsYoutubePlaylistsCollapsed(prev => !prev), []);
    const handleZoomIn = useCallback(() => {
        const currentIndex = ZOOM_LEVELS.indexOf(gridZoomLevel);
        if (currentIndex < ZOOM_LEVELS.length - 1) setGridZoomLevel(ZOOM_LEVELS[currentIndex + 1]);
    }, [gridZoomLevel]);
    const handleZoomOut = useCallback(() => {
        const currentIndex = ZOOM_LEVELS.indexOf(gridZoomLevel);
        if (currentIndex > 0) setGridZoomLevel(ZOOM_LEVELS[currentIndex - 1]);
    }, [gridZoomLevel]);
    const handleArticleZoomIn = useCallback(() => {
        const currentIndex = ZOOM_LEVELS.indexOf(articleZoomLevel);
        if (currentIndex < ZOOM_LEVELS.length - 1) setArticleZoomLevel(ZOOM_LEVELS[currentIndex + 1]);
    }, [articleZoomLevel]);
    const handleArticleZoomOut = useCallback(() => {
        const currentIndex = ZOOM_LEVELS.indexOf(articleZoomLevel);
        if (currentIndex > 0) setArticleZoomLevel(ZOOM_LEVELS[currentIndex - 1]);
    }, [articleZoomLevel]);
    const handleClearArticlesCache = useCallback(() => {
        localStorage.removeItem(ARTICLES_CACHE_KEY);
        setToast({ message: "Articles cache cleared.", type: 'success' });
    }, [setToast]);
    const handleClearAllTags = useCallback(() => {
        if (window.confirm("Are you sure you want to remove all tags from all feeds?")) {
            setFeeds(prevFeeds => prevFeeds.map(feed => ({ ...feed, tags: undefined })));
            setToast({ message: "All tags have been removed.", type: 'success' });
        }
    }, [setToast]);
    
    const handleDeleteTag = useCallback((tagToDelete: string) => {
        if (window.confirm(`Are you sure you want to delete the tag "${tagToDelete}"? This will remove it from all associated feeds and articles.`)) {
            // Remove from feeds
            setFeeds(prevFeeds => 
                prevFeeds.map(feed => {
                    if (feed.tags?.includes(tagToDelete)) {
                        const newTags = feed.tags.filter(t => t !== tagToDelete);
                        return { ...feed, tags: newTags.length > 0 ? newTags : undefined };
                    }
                    return feed;
                })
            );

            // Remove from articles
            setArticleTags(prevArticleTags => {
                const newMap = new Map(prevArticleTags);
                let changed = false;
                for (const [articleId, tags] of newMap.entries()) {
                    if (tags.includes(tagToDelete)) {
                        const newTags = tags.filter(t => t !== tagToDelete);
                        if (newTags.length > 0) {
                            newMap.set(articleId, newTags);
                        } else {
                            newMap.delete(articleId);
                        }
                        changed = true;
                    }
                }
                return changed ? newMap : prevArticleTags;
            });

            // Check if current view needs to change
            if (currentView.type === 'tag' && currentView.value === tagToDelete) {
                handleViewChange('all-subscriptions');
            }

            setToast({ message: `Tag "${tagToDelete}" deleted.`, type: 'success' });
        }
    }, [currentView, handleViewChange, setToast]);

    const handleFetchComments = useCallback(async (videoId: string) => {
        setCommentsState({ comments: null, isLoading: true, error: null });
        try {
            const comments = await fetchYouTubeComments(videoId);
            setCommentsState({ comments, isLoading: false, error: null });
        } catch (e) {
            const error = e instanceof Error ? e.message : "Failed to fetch comments.";
            setCommentsState({ comments: null, isLoading: false, error });
        }
    }, []);

       const handleFetchArticleDetails = useCallback(async (articleId: string) => {
        const article = articlesById.get(articleId);
        const videoId = article?.link ? getYouTubeId(article.link) : null;
    
        if (!article || !videoId) {
            console.warn("Could not fetch details: article or video ID not found.");
            return;
        }
    
        // Prevent re-fetching if content is already loaded (i.e., not an empty string).
        if (!!article.content) return;
    
        try {
            const { description, views } = await fetchYouTubeVideoDetails(videoId);
            
            const updateArticle = (art: Article): Article => ({
                ...art,
                content: description, // Use content to store full description
                description: description, // Also update description
                views: views,
            });
    
            // Update the main feeds state
            setFeeds(prevFeeds =>
                prevFeeds.map(feed => {
                    if (feed.id === article.feedId) {
                        return {
                            ...feed,
                            items: feed.items.map(item =>
                                item.id === articleId ? updateArticle(item) : item
                            ),
                        };
                    }
                    return feed;
                })
            );
            
            // Update the selected article if it's the one being viewed
            setSelectedArticle(prev => prev?.id === articleId ? updateArticle(prev) : prev);
    
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error("Failed to fetch article details:", error);
            // setToast({ message: `Could not load video details: ${message}`, type: 'error' });
            
            const updateWithError = (art: Article): Article => ({
                ...art,
                content: `<p>Failed to load video details: ${message}</p>`,
            });
    
            setFeeds(prevFeeds =>
                prevFeeds.map(feed => {
                    if (feed.id === article.feedId) {
                        return {
                            ...feed,
                            items: feed.items.map(item =>
                                item.id === articleId ? updateWithError(item) : item
                            ),
                        };
                    }
                    return feed;
                })
            );
            setSelectedArticle(prev => prev?.id === articleId ? updateWithError(prev) : prev);
        }
    }, [articlesById]);

    const handleRefreshCurrentView = useCallback(async () => {
        const { type, value } = currentView;
        if (type === 'favorites') {
            await handleRefreshFavorites();
        } else if (type === 'tag' && value) {
            const feedsToRefresh = feedsByTag.get(value) || [];
            await batchRefreshHandler(feedsToRefresh, `tag #${value}`);
        } else {
            setToast({ message: `Refresh is not supported for the "${headerTitle}" view.`, type: 'error' });
        }
    }, [currentView, handleRefreshFavorites, feedsByTag, batchRefreshHandler, setToast, headerTitle]);

    const handleImportBundledChannels = useCallback((feedsToImport: Omit<Feed, 'id' | 'items' | 'error'>[]) => {
        const existingUrls = new Set(feeds.map(f => f.url));
        const newFeeds = feedsToImport
            .filter(feedData => !existingUrls.has(feedData.url))
            .map(feedData => ({
                ...feedData,
                id: feedData.url,
                items: [],
                error: null,
            }));

        if (newFeeds.length > 0) {
            setFeeds(prev => [...prev, ...newFeeds]);
            setToast({ message: `Successfully added ${newFeeds.length} new feeds.`, type: 'success' });
        } else {
            setToast({ message: 'All channels from the bundle are already subscribed.', type: 'success' });
        }
    }, [feeds, setToast]);

    const handleFetchYouTubeSubscriptions = useCallback(async () => {
        if (!accessToken) {
            setYouTubeImportState({ status: 'error', subscriptions: [], error: 'You must be signed in to fetch subscriptions.' });
            handleGoogleSignIn({ showConsentPrompt: true });
            return;
        }

        setYouTubeImportState({ status: 'loading', subscriptions: [], error: null });
        try {
            const subscriptions = await fetchYouTubeSubscriptions(accessToken);
            setYouTubeImportState({ status: 'loaded', subscriptions, error: null });
        } catch (e: any) {
            if (e.isAuthError) {
                setToast({ message: "Your session has expired. Please sign in again.", type: 'error' });
                handleGoogleSignOut();
                handleGoogleSignIn({ showConsentPrompt: true });
                setYouTubeImportState({ status: 'error', subscriptions: [], error: "Authentication failed." });
            } else {
                const error = e instanceof Error ? e.message : "An unknown error occurred.";
                setYouTubeImportState({ status: 'error', subscriptions: [], error });
            }
        }
    }, [accessToken, handleGoogleSignIn, handleGoogleSignOut, setToast]);

    const handleClearYouTubeImportState = useCallback(() => {
        setYouTubeImportState({ status: 'idle', subscriptions: [], error: null });
    }, []);

    const handleAddYouTubeChannels = useCallback(async (subscriptions: YouTubeSubscription[]) => {
        const existingUrls = new Set(feeds.map(f => f.url));
        const newFeedsToAdd = subscriptions
            .map(sub => ({
                url: `https://www.youtube.com/channel/${sub.channelId}`,
                title: sub.title,
                description: sub.description,
                iconUrl: sub.thumbnailUrl,
                maxArticles: 5,
                id: `https://www.youtube.com/channel/${sub.channelId}`,
                items: [],
                error: null,
            }))
            .filter(feedData => !existingUrls.has(feedData.url));

        if (newFeedsToAdd.length > 0) {
            setFeeds(prev => [...prev, ...newFeedsToAdd]);
            setToast({ message: `Successfully added ${newFeedsToAdd.length} YouTube channels.`, type: 'success' });
        } else {
            setToast({ message: 'All selected channels are already subscribed.', type: 'success' });
        }
    }, [feeds, setToast]);

    const handleLikeVideo = useCallback(async (article: Article, options?: { isAutoLike?: boolean }) => {
        const isAuto = options?.isAutoLike ?? false;
    
        const performLike = async (token: string) => {
            const videoId = getYouTubeId(article.link);
            if (!videoId) throw new Error("Could not find video ID.");
            await likeYouTubeVideo(videoId, token);
            setLikedVideoIds(prev => new Set(prev).add(videoId));
            if (!isAuto) {
                setToast({ message: `Liked "${article.title}"`, type: 'success' });
            }
        };
    
        if (accessToken) {
            try {
                await performLike(accessToken);
            } catch (e: any) {
                if (e.isAuthError) {
                    console.warn("Token expired, queuing like and attempting silent re-auth.");
                    setAccessToken(null); // Clear expired token
                    localStorage.removeItem('gapi_access_token');
                    localStorage.removeItem('gapi_access_token_expires_at');
                    queuedLikeRef.current = { article, isAutoLike: isAuto };
                    handleGoogleSignIn({ isSilent: true });
                } else {
                    if (!isAuto) {
                        setToast({ message: e.message || 'Failed to like video.', type: 'error' });
                    }
                }
            }
        } else {
            // Not signed in
            queuedLikeRef.current = { article, isAutoLike: isAuto };
            // For auto-like, always try silently. For manual, show prompt.
            handleGoogleSignIn({ isSilent: isAuto, showConsentPrompt: !isAuto });
        }
    }, [accessToken, handleGoogleSignIn, setToast]);

    const handleSaveArticleTags = useCallback((articleId: string, tags: string[]) => {
        setArticleTags(prev => {
            const newMap = new Map(prev);
            if (tags.length > 0) {
                newMap.set(articleId, tags.sort());
            } else {
                newMap.delete(articleId);
            }
            return newMap;
        });
    }, []);

    const handleBulkSaveArticleTags = useCallback((articleIds: Set<string>, tags: string[], mode: 'add' | 'set') => {
        setArticleTags(prev => {
            const newMap = new Map(prev);
            articleIds.forEach(id => {
                if (mode === 'set') {
                    if (tags.length > 0) {
                        newMap.set(id, tags.sort());
                    } else {
                        newMap.delete(id);
                    }
                } else { // mode === 'add'
                    const existingTags = newMap.get(id) || [];
                    const newTags = Array.from(new Set([...existingTags, ...tags])).sort();
                    if (newTags.length > 0) {
                        newMap.set(id, newTags);
                    }
                }
            });
            return newMap;
        });
        setToast({ message: `Updated tags for ${articleIds.size} articles.`, type: 'success' });
        setSelectedArticleIdsForBatch(new Set()); // Clear selection after action
    }, [setToast]);

    const handleBulkClearArticleTags = useCallback(() => {
        if (selectedArticleIdsForBatch.size === 0) return;
    
        if (window.confirm(`Are you sure you want to clear all tags from the ${selectedArticleIdsForBatch.size} selected article(s)? This action cannot be undone.`)) {
            setArticleTags(prev => {
                const newMap = new Map(prev);
                selectedArticleIdsForBatch.forEach(id => {
                    newMap.delete(id);
                });
                return newMap;
            });
            setToast({ message: `Cleared all tags from ${selectedArticleIdsForBatch.size} articles.`, type: 'success' });
            setSelectedArticleIdsForBatch(new Set()); // Clear selection
            setIsBulkEditArticleTagsModalOpen(false); // Close modal
        }
    }, [selectedArticleIdsForBatch, setToast]);
    
    const handleToggleArticleSelection = useCallback((articleId: string) => {
        setSelectedArticleIdsForBatch(prev => {
            const newSet = new Set(prev);
            if (newSet.has(articleId)) {
                newSet.delete(articleId);
            } else {
                newSet.add(articleId);
            }
            return newSet;
        });
    }, []);

    const handleSelectAllArticles = useCallback(() => {
        const visibleIds = articlesToShow.map(a => a.id);
        const areAllVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedArticleIdsForBatch.has(id));

        setSelectedArticleIdsForBatch(prevSelected => {
            const newSelected = new Set(prevSelected);

            if (areAllVisibleSelected) {
                // Deselect all visible articles
                visibleIds.forEach(id => newSelected.delete(id));
            } else {
                // Select all visible articles
                visibleIds.forEach(id => newSelected.add(id));
            }
            return newSelected;
        });
    }, [articlesToShow, selectedArticleIdsForBatch]);
    
    const handleClearArticleSelection = useCallback(() => {
        setSelectedArticleIdsForBatch(new Set());
    }, []);

    const handleRemoveArticle = useCallback((articleId: string, feedId: string) => {
        const articleToRemove = deduplicateArticles(allArticles).find(a => a.id === articleId);
        if (!articleToRemove) {
            console.warn(`handleRemoveArticle: Could not find article with ID ${articleId}`);
            return;
        }
    
        if (window.confirm(`Are you sure you want to remove this article?\n\n"${articleToRemove.title}"`)) {
            setFeeds(prevFeeds => 
                prevFeeds.map(feed => {
                    if (feed.id === feedId) {
                        return {
                            ...feed,
                            items: feed.items.filter(item => item.id !== articleId),
                        };
                    }
                    return feed;
                })
            );
    
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
    
            handleCloseArticleModal();
            setToast({ message: `Removed "${articleToRemove.title}".`, type: 'success' });
        }
    }, [allArticles, handleCloseArticleModal, setToast]);

    const handleBulkDeleteArticles = useCallback(() => {
        if (selectedArticleIdsForBatch.size === 0) return;
    
        if (window.confirm(`Are you sure you want to permanently delete ${selectedArticleIdsForBatch.size} selected article(s)? This cannot be undone.`)) {
            setFeeds(prevFeeds => 
                prevFeeds.map(feed => {
                    const newItems = feed.items.filter(item => !selectedArticleIdsForBatch.has(item.id));
                    if (newItems.length < feed.items.length) {
                        return { ...feed, items: newItems };
                    }
                    return feed;
                })
            );
    
            setReadArticleIds(prev => {
                const newMap = new Map(prev);
                let changed = false;
                selectedArticleIdsForBatch.forEach(id => {
                    if (newMap.delete(id)) changed = true;
                });
                return changed ? newMap : prev;
            });
    
            setReadLaterArticleIds(prev => {
                const newSet = new Set(prev);
                let changed = false;
                selectedArticleIdsForBatch.forEach(id => {
                    if (newSet.delete(id)) changed = true;
                });
                return changed ? newSet : prev;
            });
    
            setArticleTags(prev => {
                const newMap = new Map(prev);
                let changed = false;
                selectedArticleIdsForBatch.forEach(id => {
                    if (newMap.delete(id)) changed = true;
                });
                return changed ? newMap : prev;
            });
    
            setToast({ message: `Deleted ${selectedArticleIdsForBatch.size} articles.`, type: 'success' });
            setSelectedArticleIdsForBatch(new Set());
        }
    }, [selectedArticleIdsForBatch, setToast]);

    const handleReorderArticles = useCallback((view: { type: string, value?: any }, sourceId: string, targetId: string | null) => {
        const reorder = (list: any[], sourceIdentifier: any, targetIdentifier: any | null, idField = 'id') => {
            const items = [...list];
            const sourceIndex = items.findIndex(item => item[idField] === sourceIdentifier);
            if (sourceIndex === -1) {
                console.warn(`Drag-and-drop: source item with id ${sourceIdentifier} not found in the list.`);
                return list;
            }

            const [movedItem] = items.splice(sourceIndex, 1);
            
            if (targetIdentifier === null) {
                items.push(movedItem);
            } else {
                const targetIndex = items.findIndex(item => item[idField] === targetIdentifier);
                if (targetIndex !== -1) {
                    items.splice(targetIndex, 0, movedItem);
                } else {
                    console.warn(`Drag-and-drop: target item with id ${targetIdentifier} not found. Appending to end.`);
                    items.push(movedItem); // Fallback if target not found
                }
            }
            return items;
        };

        const getBaselineOrder = (articles: Article[]) => {
            return articles.sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0)).map(a => a.id);
        };

        switch (view.type) {
            case 'feed':
                setFeeds(prevFeeds => {
                    const feedIndex = prevFeeds.findIndex(f => f.id === view.value);
                    if (feedIndex === -1) return prevFeeds;
                    const newFeeds = [...prevFeeds];
                    const feedToUpdate = { ...newFeeds[feedIndex] };
                    
                    if (!feedToUpdate.items.some(a => a.order !== undefined)) {
                        feedToUpdate.items.sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));
                        feedToUpdate.items.forEach((article, index) => { article.order = index; });
                    }

                    const sortedArticles = reorder(feedToUpdate.items, sourceId, targetId);
                    feedToUpdate.items = sortedArticles.map((article, index) => ({ ...article, order: index }));
                    newFeeds[feedIndex] = feedToUpdate;
                    return newFeeds;
                });
                break;
            case 'readLater':
                setReadLaterOrder(currentOrder => {
                    const articlesForView = Array.from(readLaterArticleIds).map(id => articlesById.get(id)).filter((a): a is Article => !!a);
                    const orderToUse = currentOrder.length > 0 ? currentOrder : getBaselineOrder(articlesForView);
                    return reorder(orderToUse.map(id => ({ id })), sourceId, targetId).map(item => item.id);
                });
                break;
            case 'tag':
                const tag = view.value;
                if (!tag) break;
                setTagOrders(currentOrders => {
                    const articlesForTag = deduplicateArticles(allArticles.filter(a => a.tags?.includes(tag) || feedsById.get(a.feedId)?.tags?.includes(tag)));
                    const orderToUse = currentOrders[tag] && currentOrders[tag].length > 0 ? currentOrders[tag] : getBaselineOrder(articlesForTag);
                    const newOrder = reorder(orderToUse.map(id => ({ id })), sourceId, targetId).map(item => item.id);
                    return { ...currentOrders, [tag]: newOrder };
                });
                break;
            case 'favorites':
                setFavoritesOrder(currentOrder => {
                     const articlesForView = deduplicateArticles(favoriteFeeds.flatMap(feed => feed.items));
                     const orderToUse = currentOrder.length > 0 ? currentOrder : getBaselineOrder(articlesForView);
                     return reorder(orderToUse.map(id => ({ id })), sourceId, targetId).map(item => item.id);
                });
                break;
        }
    }, [allArticles, feedsById, setFeeds, setReadLaterOrder, setTagOrders, setFavoritesOrder, readLaterArticleIds, articlesById, favoriteFeeds]);

    // Demo mode handlers
    const startDemo = useCallback(() => {
        const mockYouTubeSubscriptions = [
            { id: '1', channelId: 'UCBJycsmduvYEL83R_U4JriQ', title: 'Marques Brownlee', description: 'Tech reviews.', thumbnailUrl: '' },
            { id: '2', channelId: 'UC-9b7aDP6ZN0coj9-xFnrtw', title: 'Astrum', description: 'Space and science.', thumbnailUrl: '' },
            { id: '3', channelId: 'UCsTcErHg8oDvUnTzoqsYeNw', title: 'Unbox Therapy', description: 'Gadget unboxings.', thumbnailUrl: '' }
        ];
        
        const demoFeeds: Feed[] = mockYouTubeSubscriptions.map(sub => ({
            id: `https://www.youtube.com/channel/${sub.channelId}/home`,
            url: `https://www.youtube.com/channel/${sub.channelId}/home`,
            title: sub.title,
            items: [],
            error: null
        }));

        setFeeds(currentFeeds => {
            const currentUrls = new Set(currentFeeds.map(f => f.url));
            const newFeedsToAdd = demoFeeds.filter(df => !currentUrls.has(df.url));
            return [...currentFeeds, ...newFeedsToAdd];
        });

        setIsDemoMode(true);
        setDemoStep(0);
    }, []);

    const endDemo = useCallback(() => {
        setIsDemoMode(false);
        setDemoStep(0);
        
        // Remove the demo channels by their URLs.
        const demoChannelUrls = new Set([
            'https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ/home',
            'https://www.youtube.com/channel/UC-9b7aDP6ZN0coj9-xFnrtw/home',
            'https://www.youtube.com/channel/UCsTcErHg8oDvUnTzoqsYeNw/home'
        ]);

        setFeeds(currentFeeds => currentFeeds.filter(feed => !demoChannelUrls.has(feed.url)));

    }, []);

    const handleDemoNext = useCallback(() => {
        setDemoStep(prev => {
            const nextStep = prev + 1;
            if (nextStep === 1) { // After welcome
                setIsImportYouTubeModalOpen(true);
            }
            if (nextStep === 2) { // After import explanation
                setIsImportYouTubeModalOpen(false);
                handleViewChange('feed', 'https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ/home');
            }
            if (nextStep === 5) { // After Add Any Source
                 handleViewChange('all-subscriptions');
            }
            if (nextStep >= 7) { // End of demo
                endDemo();
                return prev;
            }
            return nextStep;
        });
    }, [endDemo, handleViewChange]);

    const handleToggleAutoplayNext = useCallback(() => {
        setAutoplayMode(prev => prev === 'on' ? 'off' : 'on');
    }, []);
    const handleToggleAutoplayRandom = useCallback(() => {
        setAutoplayMode(prev => prev === 'random' ? 'off' : 'random');
    }, []);
    const handleToggleAutoplayRepeat = useCallback(() => {
        setAutoplayMode(prev => prev === 'repeat' ? 'off' : 'repeat');
    }, []);
    const handleToggleAutoLikeYouTubeVideos = useCallback(() => {
        setAutoLikeYouTubeVideos(prev => !prev);
    }, []);
    const handleToggleRssAndReddit = useCallback(() => {
        setEnableRssAndReddit(prev => !prev);
    }, []);

    // Effect for handling state persistence to localStorage
    useEffect(() => { safeSetLocalStorage(FEEDS_STORAGE_KEY, feeds); }, [feeds, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(ARTICLE_TAGS_KEY, articleTags); }, [articleTags, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(READ_LATER_ORDER_KEY, readLaterOrder); }, [readLaterOrder, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(TAG_ORDERS_KEY, tagOrders); }, [tagOrders, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(FAVORITES_ORDER_KEY, favoritesOrder); }, [favoritesOrder, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(READ_ARTICLES_KEY, readArticleIds); }, [readArticleIds, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(READ_LATER_KEY, readLaterArticleIds); }, [readLaterArticleIds, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(LIKED_YOUTUBE_VIDEOS_KEY, likedVideoIds); }, [likedVideoIds, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(SIDEBAR_COLLAPSED_KEY, isSidebarCollapsed); }, [isSidebarCollapsed, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(VIEWS_COLLAPSED_KEY, isViewsCollapsed); }, [isViewsCollapsed, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(FAVORITES_COLLAPSED_KEY, isFavoritesCollapsed); }, [isFavoritesCollapsed, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(YOUTUBE_FEEDS_COLLAPSED_KEY, isYoutubeFeedsCollapsed); }, [isYoutubeFeedsCollapsed, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(YOUTUBE_PLAYLISTS_COLLAPSED_KEY, isYoutubePlaylistsCollapsed); }, [isYoutubePlaylistsCollapsed, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(REDDIT_FEEDS_COLLAPSED_KEY, isRedditFeedsCollapsed); }, [isRedditFeedsCollapsed, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(RSS_FEEDS_COLLAPSED_KEY, isRssFeedsCollapsed); }, [isRssFeedsCollapsed, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(TAGS_COLLAPSED_KEY, isTagsCollapsed); }, [isTagsCollapsed, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(EXPANDED_TAGS_KEY, expandedTags); }, [expandedTags, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(GRID_ZOOM_LEVEL_KEY, gridZoomLevel); }, [gridZoomLevel, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(ARTICLE_ZOOM_LEVEL_KEY, articleZoomLevel); }, [articleZoomLevel, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(PROXY_STATS_KEY, proxyStats); }, [proxyStats, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(DISABLED_PROXIES_KEY, disabledProxies); }, [disabledProxies, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(AUTOPLAY_MODE_KEY, autoplayMode); }, [autoplayMode, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(AUTO_LIKE_YOUTUBE_VIDEOS_KEY, autoLikeYouTubeVideos); }, [autoLikeYouTubeVideos, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(AUTO_LIKE_DELAY_SECONDS_KEY, autoLikeDelaySeconds); }, [autoLikeDelaySeconds, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(ENABLE_RSS_REDDIT_KEY, enableRssAndReddit); }, [enableRssAndReddit, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(REFRESH_BATCH_SIZE_KEY, refreshBatchSize); }, [refreshBatchSize, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(REFRESH_DELAY_SECONDS_KEY, refreshDelaySeconds); }, [refreshDelaySeconds, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(RECENT_SHARE_CODES_KEY, recentShareCodes); }, [recentShareCodes, safeSetLocalStorage]);
    useEffect(() => { safeSetLocalStorage(HAS_ENTERED_KEY, hasEnteredApp); }, [hasEnteredApp, safeSetLocalStorage]);
    
    // Effect for handling URL hash changes
    useEffect(() => {
        const handleHashChange = () => {
            const newView = getInitialView();
            setCurrentView(newView);
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    // Update backgroundView whenever currentView changes to a non-article view.
    useEffect(() => {
        if (currentView.type !== 'article') {
            setBackgroundView(currentView);
        }
    }, [currentView]);

    useEffect(() => {
        setIsResolvingArticleUrl(false);
        if (currentView.type === 'import' && currentView.value) {
            setImportCodeFromUrl(currentView.value);
            setIsImportTextModalOpen(true);
        } else if (currentView.type === 'article' && currentView.value) {
            const { feedId, articleId } = currentView.value;

            // Automatically mark the article as read upon viewing.
            setReadArticleIds(prev => {
                // Always update the timestamp to reflect the most recent view time.
                const newMap = new Map(prev);
                newMap.set(articleId, Date.now());
                return newMap;
            });

            const article = articlesById.get(articleId);
            if (article && article.feedId === feedId) {
                setSelectedArticle(article);
                // On direct navigation, if we don't have a better background, set it to the article's feed.
                if (backgroundView.type === 'all-subscriptions' || backgroundView.type === 'article') {
                     setBackgroundView({ type: 'feed', value: feedId });
                }
            } else {
                // Article is not in memory. Try to resolve it.
                setIsResolvingArticleUrl(true);
                (async () => {
                    try {
                        let targetFeed = feedsById.get(feedId);
                        let resolvedArticle: Article | null = null;

                        // Check if it's a YouTube video
                        const ytVideoId = getYouTubeId(articleId) || (articleId.length === 11 ? articleId : null);

                        if (ytVideoId) {
                            resolvedArticle = await fetchSingleYouTubeVideoAsArticle(ytVideoId);
                        }

                        if (!resolvedArticle) {
                            // If it's not a YT video or fetching failed, try fetching the whole feed
                            if (!targetFeed) {
                                const newFeed = await handleAddFeed(feedId, 50, { headless: true });
                                if (newFeed) {
                                    targetFeed = newFeed;
                                }
                            } else {
                                await handleRefreshSingleFeed(feedId);
                            }
                            
                            // After refreshing, check again for the article
                            const refreshedFeeds = getStoredData<Feed[]>(FEEDS_STORAGE_KEY, []);
                            const refreshedTargetFeed = refreshedFeeds.find(f => f.id === feedId);
                            resolvedArticle = refreshedTargetFeed?.items.find(a => a.id === articleId) || null;
                        }

                        if (resolvedArticle) {
                            // If the feed wasn't present before, add it now.
                            if (!feedsById.has(resolvedArticle.feedId)) {
                                const newFeedForArticle: Feed = {
                                    id: resolvedArticle.feedId,
                                    url: resolvedArticle.feedId.startsWith('http') ? resolvedArticle.feedId : `https://www.youtube.com/channel/${resolvedArticle.feedId}`,
                                    title: resolvedArticle.feedTitle,
                                    items: [resolvedArticle],
                                    error: null
                                };
                                setFeeds(prev => [...prev, newFeedForArticle]);
                            } else {
                                // Add the article to the existing feed if it's not already there.
                                setFeeds(prev => prev.map(f => {
                                    if (f.id === resolvedArticle!.feedId) {
                                        const articleExists = f.items.some(item => item.id === resolvedArticle!.id);
                                        return articleExists ? f : { ...f, items: [...f.items, resolvedArticle!] };
                                    }
                                    return f;
                                }));
                            }
                            
                            // After finding it, set the background view so navigation works
                            setBackgroundView({ type: 'feed', value: resolvedArticle.feedId });
                            setSelectedArticle(resolvedArticle);

                        } else {
                            throw new Error("Could not find the article in the feed. It may be too old.");
                        }
                    } catch (e) {
                        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
                        setToast({ message: `Failed to load shared article: ${message}`, type: 'error' });
                        handleViewChange('all-subscriptions');
                    } finally {
                        setIsResolvingArticleUrl(false);
                    }
                })();
            }
        } else {
            setSelectedArticle(null);
        }

        if (currentView.type === 'feed' && typeof currentView.value === 'string') {
            setSelectedFeedId(currentView.value);
        } else {
            setSelectedFeedId(null);
        }
    }, [currentView, articlesById, feedsById, handleAddFeed, backgroundView.type]);
    
    // Effect to update the document title based on the current view or article.
    useEffect(() => {
        if (selectedArticle) {
            document.title = selectedArticle.title;
        } else {
            document.title = headerTitle || 'Media-Feeder';
        }
    }, [selectedArticle, headerTitle]);

    // Final setup and initial data load
    useEffect(() => {
        // Load articles from cache for faster startup
        const cachedArticles = getStoredData<Record<string, Article[]>>(ARTICLES_CACHE_KEY, {});
        setFeeds(currentFeeds => {
            let updated = false;
            const updatedFeeds = currentFeeds.map(feed => {
                const cached = cachedArticles[feed.id];
                if (cached && (!feed.items || feed.items.length === 0)) {
                    updated = true;
                    return { ...feed, items: cached };
                }
                return feed;
            });
            return updated ? updatedFeeds : currentFeeds;
        });

        setIsInitialLoad(false);

        // Auto-refresh on startup disabled by user request.
        // setTimeout(() => {
        //     handleRefreshAllFeeds();
        // }, 1000);

        const gsiAuthErrorHandler = (event: Event) => {
            const customEvent = event as CustomEvent;
            setToast({ message: customEvent.detail.message, type: 'error' });
        };
        window.addEventListener('gsi_auth_error', gsiAuthErrorHandler);

        return () => window.removeEventListener('gsi_auth_error', gsiAuthErrorHandler);
    }, []);
    
    // Proactive token refresh timer effect
    useEffect(() => {
        const clearTimer = () => {
            if (tokenRefreshTimerRef.current) {
                clearTimeout(tokenRefreshTimerRef.current);
                tokenRefreshTimerRef.current = null;
            }
        };

        const setupRefreshTimer = () => {
            clearTimer();
            const storedExpiresAt = localStorage.getItem('gapi_access_token_expires_at');
            if (accessToken && storedExpiresAt) {
                const expiresAt = parseInt(storedExpiresAt, 10);
                const now = Date.now();
                
                if (expiresAt > now) {
                    // Refresh 5 minutes before expiry, or immediately if within 5 mins.
                    const refreshDelay = Math.max(0, expiresAt - now - (5 * 60 * 1000));
                    
                    tokenRefreshTimerRef.current = window.setTimeout(() => {
                        console.log("[DEBUG] Proactively refreshing Google token...");
                        handleGoogleSignIn({ isSilent: true });
                    }, refreshDelay);
                } else {
                    // Token is expired, sign out to clear it
                    handleGoogleSignOut();
                }
            }
        };
        
        setupRefreshTimer();
        
        return clearTimer; // Cleanup on unmount or when accessToken/signOut functions change
    }, [accessToken, handleGoogleSignIn, handleGoogleSignOut]);

    // GSI Initialization
    useEffect(() => {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            console.warn("Google Client ID is not configured. Google Sign-In and related features will be disabled.");
            return;
        }

        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl',
            callback: (tokenResponse) => {
                if (tokenResponse.error) { return; }
    
                const newAccessToken = tokenResponse.access_token;
                const expiresIn = tokenResponse.expires_in;
                const expiresAt = Date.now() + (expiresIn * 1000);
    
                setAccessToken(newAccessToken);
                localStorage.setItem('gapi_access_token', newAccessToken);
                localStorage.setItem('gapi_access_token_expires_at', expiresAt.toString());

                // Fetch user profile info
                fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': `Bearer ${newAccessToken}` }
                })
                .then(res => res.json())
                .then(profile => {
                    if (profile.email) {
                        const userProfileData: UserProfile = {
                            email: profile.email,
                        };
                        setUserProfile(userProfileData);
                        safeSetLocalStorage('gapi_user_profile', userProfileData);
                    } else {
                        console.error("User info response did not contain an email address.");
                    }
                })
                .catch(e => console.error("Failed to fetch user profile:", e));
                
                const queuedAction = queuedLikeRef.current;
                if (queuedAction) {
                    const { article, isAutoLike } = queuedAction;
                    queuedLikeRef.current = null;
    
                    (async () => {
                        try {
                            const videoId = getYouTubeId(article.link);
                            if (!videoId) throw new Error("Could not find video ID for this article.");
                            await likeYouTubeVideo(videoId, newAccessToken);
                            setLikedVideoIds(prev => new Set(prev).add(videoId));
                            if (!isAutoLike) setToast({ message: `Liked "${article.title}"`, type: 'success' });
                        } catch (e) {
                            if (!isAutoLike) setToast({ message: e instanceof Error ? e.message : "Failed to like video after sign-in.", type: 'error' });
                        }
                    })();
                } else if (!isImportYouTubeModalOpen) {
                    setToast({ message: "Signed in successfully.", type: 'success' });
                }
            },
            error_callback: (error) => {
                const queuedAction = queuedLikeRef.current;
                queuedLikeRef.current = null;
    
                if (queuedAction && !queuedAction.isAutoLike) {
                    let message = 'An unknown sign-in error occurred.';
                    if (error?.type === 'popup_closed') message = 'Sign-in cancelled: The pop-up was closed.';
                    else if (error?.message) message = error.message;
                    setToast({ message, type: 'error' });
                } else {
                    console.warn("Silent auth failed, which is expected if not signed in.", error);
                }
            }
        });

    }, [setToast, setAccessToken, setLikedVideoIds, isImportYouTubeModalOpen, safeSetLocalStorage]);
    
    const contextValue: AppContextType = {
        feeds: feedsToShowInApp, isInitialLoad, isViewLoading, selectedFeedId, selectedArticle, setSelectedArticle,
        currentView, contentView, readArticleIds, readLaterArticleIds, likedVideoIds,
        isSidebarCollapsed, isViewsCollapsed, isYoutubeFeedsCollapsed, isRssFeedsCollapsed, isRedditFeedsCollapsed, isTagsCollapsed,
        isYoutubePlaylistsCollapsed, 
        expandedTags, isFavoritesCollapsed,
        isAddFeedModalOpen, setAddFeedModalOpen, 
        isExportModalOpen, setIsExportModalOpen, isAdvancedInfoModalOpen, setIsAdvancedInfoModalOpen,
        isAiSettingsModalOpen, setIsAiSettingsModalOpen, isImportTextModalOpen, setIsImportTextModalOpen,
        isProxyStatsModalOpen, setIsProxyStatsModalOpen,
        isCacheInfoModalOpen, setIsCacheInfoModalOpen,
        isExportTextModalOpen, setIsExportTextModalOpen,
        isClearDataModalOpen, setIsClearDataModalOpen,
        exportTextContent,
        proxyStats, disabledProxies, handleProxyAttempt, handleClearProxyStats, handleToggleProxy,
        feedToEdit, setFeedToEdit, feedToEditTags, setFeedToEditTags,
        isDigestModalOpen, setIsDigestModalOpen, digestState,
        isDigestConfigModalOpen, setIsDigestConfigModalOpen,
        articlesForDigest, initialDigestLanguage,
        translateDigest, isRecommendationsModalOpen, setIsRecommendationsModalOpen,
        recommendationsState, setRecommendationsState,
        isRelatedModalOpen, setIsRelatedModalOpen, relatedChannelsState,
        setRelatedChannelsState,
        relatedSourceFeedId, setRelatedSourceFeedId,
        bulkEditModalConfig, setBulkEditModalConfig,
        toast, setToast,
        isRefreshingAll, refreshingFeedId, refreshProgress, allArticles, inactiveFeeds,
        inactivePeriod, setInactivePeriod, allTags, sortedFeeds, favoriteFeeds, unreadCounts,
        commentsState,
        handleFetchComments,
        handleFetchArticleDetails,
        unreadTagCounts, unreadFavoritesCount, feedsByTag, articlesToShow, articlesForNavigation, availableTagsForFilter, unreadVisibleCount, headerTitle, emptyMessage, articleNavigation,
        gridZoomLevel, canZoomIn, canZoomOut, articleZoomLevel, canArticleZoomIn, canArticleZoomOut,
        aiModel,
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
        handleToggleRssAndReddit,
        urlFromExtension,
        setUrlFromExtension,
        isProcessingUrl,
        isDemoMode,
        demoStep,
        startDemo,
        endDemo,
        handleDemoNext,
        handleViewChange, handleSelectFeed, handleAddFeed,
        handleAddFromRecommendation, handleDeleteFeed,
        handleDeleteTag,
        handleBulkDeleteFeeds, handleToggleFavorite, handleSaveFeedTitle,
        handleSaveFeedMaxArticles,
        handleSaveFeedTags, handleToggleReadStatus, handleToggleReadLater,
        handleSummaryGenerated, 
        handleRefreshSingleFeed, handleRefreshAllFeeds, handleRefreshFavorites, handleRefreshTaggedFeeds, handleRefreshCurrentView,
        handleRefreshMissingIcons,
        handleGenerateDigest, handleExecuteDigest, handleGenerateRecommendations, handleGenerateMoreRecommendations,
        handleResetRecommendations, handleExportFeeds,
        handleExportChannelsAsText,
        handleShareToCloudLink,
        handleImportData,
        handleOpenClearDataModal,
        handleClearArticlesAndHistory,
        handleFactoryReset,
        handleSearch, handleClearSearch,
        handleClearHistory, handleClearReadLater, handleMarkAllInAllFeedsAsRead, handleMarkAllRead, 
        handleMarkSelectedAsRead,
        handleOpenArticle,
        handleCloseArticleModal,
        handleRemoveArticle,
        handleBulkDeleteArticles,
        handleReorderArticles,
        handleOpenRelatedModal, handleCloseRelatedModal, handleGenerateRelated,
        handleBulkUpdateTags,
        handleOpenBulkEdit, handleOpenBulkEditForTag, handleOpenBulkEditForFavorites, onToggleSidebar, onToggleViewsCollapse,
        onToggleYoutubeFeedsCollapse, onToggleRssFeedsCollapse, onToggleRedditFeedsCollapse, onToggleTagsCollapse, onToggleTagExpansion, onToggleFavoritesCollapse,
        onToggleYoutubePlaylistsCollapse, 
        handleZoomIn, handleZoomOut, handleArticleZoomIn, handleArticleZoomOut,
        calculateStorageSize, handleClearArticlesCache, handleClearAllTags,
        userProfile,
        handleGoogleSignIn,
        handleGoogleSignOut,
        isBundledChannelsModalOpen,
        setIsBundledChannelsModalOpen,
        handleImportBundledChannels,
        isImportYouTubeModalOpen,
        setIsImportYouTubeModalOpen,
        youTubeImportState,
        handleFetchYouTubeSubscriptions,
        handleClearYouTubeImportState,
        handleAddYouTubeChannels,
        handleLikeVideo,
        // Article Tagging
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
        // Add single video vs. channel
        videoToAdd,
        handleConfirmAddChannel,
        handleConfirmAddSingleVideo,
        handleCancelAddVideoOrChannel,
        hasEnteredApp,
        handleEnterApp,
    };
    
    return (
        <AppContext.Provider value={contextValue}>
            {children}
        </AppContext.Provider>
    );
};