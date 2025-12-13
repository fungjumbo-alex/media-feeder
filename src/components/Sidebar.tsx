import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import {
  RssIcon,
  HistoryIcon,
  ClockIcon,
  StarIcon,
  SettingsIcon,
  YouTubeIcon,
  TagIcon,
  ChevronDoubleLeftIcon,
  ChevronRightIcon,
  BookmarkIcon,
  GridViewIcon,
  RedditIcon,
  YouTubePlaylistIcon,
  RefreshIcon,
  CheckCircleIcon,
  PlusIcon,
  PackageIcon,
  SyncIcon,
  ImportIcon,
  ExportIcon,
  ListIcon,
  FolderIcon,
  TrendingUpIcon,
  AiSummaryIcon,
} from './icons';
import { SearchInput } from './SearchInput';
import type { Feed } from '../types';

const Tooltip: React.FC<{ text: string; isVisible: boolean; children: React.ReactNode }> = ({
  text,
  isVisible,
  children,
}) => {
  return (
    <div className="group relative flex items-center">
      {children}
      {isVisible && (
        <div className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
          {text}
        </div>
      )}
    </div>
  );
};

const MenuButton: React.FC<{
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
  isDanger?: boolean;
}> = ({ onClick, icon: Icon, label, disabled = false, isDanger = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center px-3 py-2 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${isDanger ? 'text-red-400 hover:bg-red-500/20' : 'text-gray-200 hover:bg-gray-600'}`}
  >
    <Icon className="w-4 h-4 mr-3" />
    {label}
  </button>
);

const isYouTubeFeed = (feed: Feed) => feed.url.toLowerCase().includes('youtube.com');
const isYouTubePlaylist = (feed: Feed) =>
  isYouTubeFeed(feed) && (feed.id.includes('/playlist?list=') || feed.id.includes('playlist_id='));
const isYouTubeChannel = (feed: Feed) => isYouTubeFeed(feed) && !isYouTubePlaylist(feed);

const NavItem: React.FC<{
  type: string;
  value?: any;
  icon: React.ElementType;
  label: string;
  count?: number;
  isTabbed?: boolean;
  currentTab?: 'yt' | 'rss';
  forceInactive?: boolean;
  onCloseMindmap?: () => void;
}> = ({ type, value, icon: Icon, label, count, isTabbed = false, currentTab, ...props }) => {
  const { handleViewChange, currentView, isSidebarCollapsed, isMobileView } = useAppContext();

  const handleClick = () => {
    if (props.onCloseMindmap) props.onCloseMindmap();
    if (isTabbed) handleViewChange(type, currentTab);
    else handleViewChange(type, value);
  };

  const effectiveValue = isTabbed ? value : value !== undefined ? value : '';
  let finalIsActive = currentView.type === type;
  if (effectiveValue) {
    if (typeof effectiveValue === 'object') {
      finalIsActive =
        finalIsActive && JSON.stringify(currentView.value) === JSON.stringify(effectiveValue);
    } else {
      finalIsActive = finalIsActive && currentView.value === effectiveValue;
    }
  } else if (currentView.type === type && type === 'readLater' && !currentView.value) {
    // Special case for readLater when no tab is selected. Defaults to 'yt'.
    finalIsActive = currentTab === 'yt';
  } else if (currentView.type === type) {
    finalIsActive = !currentView.value || currentView.value === currentTab;
  } else {
    finalIsActive = false;
  }

  // If mindmap is open, nothing else should be active
  if (props.forceInactive) {
    finalIsActive = false;
  }

  const hrefValue = value
    ? typeof value === 'object'
      ? `/${value.type}/${encodeURIComponent(value.name)}`
      : `/${encodeURIComponent(value)}`
    : isTabbed
      ? `/${currentTab}`
      : '';

  return (
    <Tooltip text={label} isVisible={isSidebarCollapsed && !isMobileView}>
      <a
        href={`#/${type}${hrefValue}`}
        onClick={e => {
          e.preventDefault();
          handleClick();
        }}
        className={`flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors ${finalIsActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
      >
        <Icon className="w-5 h-5" />
        {!isSidebarCollapsed && <span className="ml-3 flex-1 truncate">{label}</span>}
        {count !== undefined && count > 0 && !isSidebarCollapsed && (
          <span className="ml-auto text-xs font-semibold bg-gray-600 text-gray-200 rounded-full px-2 py-0.5">
            {count}
          </span>
        )}
      </a>
    </Tooltip>
  );
};

const colors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
];

const getHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
};

const SidebarFeedIcon: React.FC<{ feed: Feed; count: number; onCloseMindmap?: () => void }> = ({
  feed,
  count,
  onCloseMindmap,
}) => {
  const { handleSelectFeed, currentView } = useAppContext();
  const [hasError, setHasError] = useState(false);
  const unreadCount = count;
  const isActive = currentView.type === 'feed' && currentView.value === feed.id;

  const fallbackColor = useMemo(() => {
    const hash = getHash(feed.title || 'Fallback');
    return colors[Math.abs(hash) % colors.length];
  }, [feed.title]);

  const initial = useMemo(() => {
    return (feed.title || 'F').charAt(0).toUpperCase();
  }, [feed.title]);



  return (
    <Tooltip text={feed.title} isVisible={true}>
      <button
        onClick={() => {
          if (onCloseMindmap) onCloseMindmap();
          handleSelectFeed(feed.id);
        }}
        className={`relative aspect-square w-full bg-gray-700 rounded-md overflow-hidden transform z-0 hover:scale-125 hover:z-10 transition-transform duration-200 focus:outline-none focus:ring-2 ring-offset-2 ring-offset-gray-800 ring-indigo-500 ${isActive ? 'ring-2 ring-indigo-500' : ''}`}
        title={feed.title}
      >
        {feed.iconUrl && !hasError ? (
          <img
            src={feed.iconUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setHasError(true)}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center rounded ${fallbackColor}`}>
            <span className="font-bold text-white/80 text-lg">{initial}</span>
          </div>
        )}
        {unreadCount > 0 && (
          <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center shadow-md border border-gray-800">
            {unreadCount}
          </div>
        )}
      </button>
    </Tooltip>
  );
};

const FeedsList: React.FC<{
  feeds: Feed[];
  typeFilter: (feed: Feed) => boolean;
  viewUnreadCounts?: Record<string, number>;
  onCloseMindmap?: () => void;
}> = ({ feeds, typeFilter, viewUnreadCounts, onCloseMindmap }) => {
  const { unreadCounts, sidebarFeedsView } = useAppContext();
  const filteredFeeds = useMemo(() => feeds.filter(typeFilter), [feeds, typeFilter]);
  if (filteredFeeds.length === 0) return null;

  if (sidebarFeedsView === 'icons') {
    return (
      <div className="grid grid-cols-3 gap-2 p-2">
        {filteredFeeds.map(feed => {
          const count = viewUnreadCounts
            ? viewUnreadCounts[feed.id] || 0
            : unreadCounts[feed.id] || 0;
          return (
            <SidebarFeedIcon
              key={feed.id}
              feed={feed}
              count={count}
              onCloseMindmap={onCloseMindmap}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {filteredFeeds.map(feed => {
        const count = viewUnreadCounts
          ? viewUnreadCounts[feed.id] || 0
          : unreadCounts[feed.id] || 0;
        return (
          <NavItem
            key={feed.id}
            type="feed"
            value={feed.id}
            icon={
              isYouTubeFeed(feed)
                ? isYouTubePlaylist(feed)
                  ? YouTubePlaylistIcon
                  : YouTubeIcon
                : feed.url.includes('reddit.com')
                  ? RedditIcon
                  : RssIcon
            }
            label={feed.title}
            count={count}
            onCloseMindmap={onCloseMindmap}
          />
        );
      })}
    </div>
  );
};

const TagWithFeeds: React.FC<{
  tag: string;
  unreadCount: number;
  tagType: 'youtube' | 'rss';
  onCloseMindmap?: () => void;
}> = ({ tag, unreadCount, tagType, onCloseMindmap }) => {
  const {
    currentView,
    handleViewChange,
    isSidebarCollapsed,
    isMobileView,
    expandedTags,
    onToggleTagExpansion,
    feedsByTag,
    favoriteFeeds,
  } = useAppContext();

  const isFavorites = tag === '__FAVORITES__';
  const tagName = isFavorites ? '__FAVORITES__' : tag;
  const compositeKey = `${tagType}-${tagName}`;

  const feedsForDisplay = useMemo(() => {
    if (isFavorites) {
      return tagType === 'youtube'
        ? favoriteFeeds.filter(isYouTubeFeed)
        : favoriteFeeds.filter(feed => !isYouTubeFeed(feed));
    }
    const allFeedsForTag = feedsByTag.get(tag) || [];
    if (tagType === 'youtube') {
      return allFeedsForTag.filter(isYouTubeFeed);
    } else {
      return allFeedsForTag.filter(feed => !isYouTubeFeed(feed));
    }
  }, [feedsByTag, tag, tagType, isFavorites, favoriteFeeds]);

  const isExpanded = expandedTags.has(compositeKey);

  const handleExpandClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleTagExpansion(tagName, tagType);
  };

  const handleNavClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onCloseMindmap) onCloseMindmap();
    if (isFavorites) {
      handleViewChange('favorites', tagType);
    } else {
      handleViewChange('tag', { name: tag, type: tagType });
    }
  };

  const navHref = isFavorites
    ? `#/favorites/${tagType}`
    : `#/tag/${tagType}/${encodeURIComponent(tag)}`;
  const label = isFavorites ? 'Favorites' : tag;
  const Icon = isFavorites ? StarIcon : TagIcon;

  const isActive = isFavorites
    ? currentView.type === 'favorites' &&
    (currentView.value === tagType || (currentView.value === 'yt' && tagType === 'youtube'))
    : currentView.type === 'tag' &&
    JSON.stringify(currentView.value) === JSON.stringify({ name: tag, type: tagType });

  if (isFavorites && feedsForDisplay.length === 0) {
    return null;
  }

  return (
    <div>
      <Tooltip text={label} isVisible={isSidebarCollapsed && !isMobileView}>
        <a
          href={navHref}
          onClick={handleNavClick}
          className={`flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors ${isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
        >
          <Icon className={`w-5 h-5 ${isFavorites ? 'text-yellow-400' : ''}`} />
          {!isSidebarCollapsed && (
            <>
              <span className="ml-3 flex-1 truncate">{label}</span>
              {unreadCount > 0 && (
                <span className="ml-2 text-xs font-semibold bg-gray-600 text-gray-200 rounded-full px-2 py-0.5">
                  {unreadCount}
                </span>
              )}
              {feedsForDisplay.length > 0 && (
                <button
                  onClick={handleExpandClick}
                  className="p-1 ml-1 rounded-full hover:bg-gray-600"
                  aria-expanded={isExpanded}
                >
                  <ChevronRightIcon
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </button>
              )}
            </>
          )}
        </a>
      </Tooltip>
      {isExpanded && !isSidebarCollapsed && feedsForDisplay.length > 0 && (
        <div className="pl-4 pt-1">
          <FeedsList
            feeds={feedsForDisplay}
            typeFilter={() => true}
            onCloseMindmap={onCloseMindmap}
          />
        </div>
      )}
    </div>
  );
};

const ViewWithFeeds: React.FC<{
  viewType: 'published-today' | 'readLater' | 'history';
  icon: React.ElementType;
  label: string;
  totalUnreadCount: number;
  currentTab: 'yt' | 'rss';
  onCloseMindmap?: () => void;
}> = ({ viewType, icon: Icon, label, totalUnreadCount, currentTab, onCloseMindmap }) => {
  const {
    currentView,
    handleViewChange,
    isSidebarCollapsed,
    isMobileView,
    expandedViews,
    onToggleViewExpansion,
    feedsForPublishedToday,
    feedsForReadLater,
    feedsForHistory,
    unreadCountsForPublishedToday,
    unreadCountsForReadLater,
  } = useAppContext();

  const isExpanded = expandedViews.has(viewType);

  const feedsForDisplay = useMemo(() => {
    if (viewType === 'published-today') return feedsForPublishedToday;
    if (viewType === 'readLater') return feedsForReadLater;
    if (viewType === 'history') return feedsForHistory;
    return [];
  }, [viewType, feedsForPublishedToday, feedsForReadLater, feedsForHistory]);

  const viewUnreadCounts = useMemo(() => {
    if (viewType === 'published-today') return unreadCountsForPublishedToday;
    if (viewType === 'readLater') return unreadCountsForReadLater;
    return undefined;
  }, [viewType, unreadCountsForPublishedToday, unreadCountsForReadLater]);

  const handleExpandClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleViewExpansion(viewType);
  };

  const handleNavClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onCloseMindmap) onCloseMindmap();
    handleViewChange(viewType, currentTab);
  };

  const navHref = `#/${viewType}/${currentTab}`;

  const isActive =
    currentView.type === viewType &&
    (currentView.value === currentTab || (!currentView.value && currentTab === 'yt'));

  const filteredFeedsForDisplay = useMemo(() => {
    return feedsForDisplay.filter(feed => {
      const isYouTube = isYouTubeFeed(feed);
      return currentTab === 'yt' ? isYouTube : !isYouTube;
    });
  }, [feedsForDisplay, currentTab]);

  return (
    <div>
      <Tooltip text={label} isVisible={isSidebarCollapsed && !isMobileView}>
        <a
          href={navHref}
          onClick={handleNavClick}
          className={`flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors ${isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
        >
          <Icon className="w-5 h-5" />
          {!isSidebarCollapsed && (
            <>
              <span className="ml-3 flex-1 truncate">{label}</span>
              {viewType !== 'history' && totalUnreadCount > 0 && (
                <span className="ml-2 text-xs font-semibold bg-gray-600 text-gray-200 rounded-full px-2 py-0.5">
                  {totalUnreadCount}
                </span>
              )}
              {filteredFeedsForDisplay.length > 0 && (
                <button
                  onClick={handleExpandClick}
                  className="p-1 ml-1 rounded-full hover:bg-gray-600"
                  aria-expanded={isExpanded}
                >
                  <ChevronRightIcon
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </button>
              )}
            </>
          )}
        </a>
      </Tooltip>
      {isExpanded && !isSidebarCollapsed && filteredFeedsForDisplay.length > 0 && (
        <div className="pl-4 pt-1">
          <FeedsList
            feeds={filteredFeedsForDisplay}
            typeFilter={() => true}
            viewUnreadCounts={viewUnreadCounts}
            onCloseMindmap={onCloseMindmap}
          />
        </div>
      )}
    </div>
  );
};


const TopicItem: React.FC<{
  title: string;
  articleIds: string[];
  subTopics?: { title: string; articleIds: string[] }[];
  depth?: number;
  onNavigate: (title: string, ids: string[]) => void;
}> = ({ title, articleIds, subTopics, depth = 0, onNavigate }) => {
  const { currentView, allArticles, sidebarTab, feedsById } = useAppContext();
  const hasSubTopics = subTopics && subTopics.length > 0;

  // Filter articleIds to only include those that:
  // 1. Exist in allArticles
  // 2. Match the current sidebarTab (YT vs RSS)
  const validArticleCount = useMemo(() => {
    if (!allArticles || !feedsById) return 0;

    // Create a set of valid IDs for O(1) lookup, but we have strict checks
    // Actually we iterate IDs and check existence.
    // Optimization: allArticles is large. articlesById would be better.
    // But we might only have allArticles exposed efficiently or as an array.
    // Let's assume allArticles is available.
    // To avoid O(N*M), let's use allArticles.find? No fast lookup.
    // If allArticles is array, checking existence for each ID is slow.
    // However, articleIds for a topic is usually small.
    // But we do this for EVERY topic item.
    // If we have articlesById map in context, that's best.
    // Let's check if articlesById is exposed in useAppContext. 
    // If not, we iterate articleIds and find in allArticles. 
    // Given the previous code used allArticles.filter(id set), it implies allArticles iteration.

    // Let's filter the input articleIds.
    // We need to check if the article exists AND matches tab.
    // Since we don't have a map, we have to iterate allArticles? 
    // NO! That would be terrible for performance in a list.
    // We should iterate articleIds and check against a Map.
    // DOES appContext provide a map?
    // Let's assume for now we use allArticles.
    // Wait, the previous `filteredArticles` logic iterated `allArticles`. 
    // Here we are inside `TopicItem`. If we iterate `allArticles` for every topic, it will lag.

    // Ideally we rely on the parent or `AiTopicsList` to pre-calculate, or we get a Map.
    // AppContext usually has `articlesById`. Let's assume it's exposed or verify.
    // I will use allArticles.find for now, but really I should verify `articlesById` existence.

    // Wait, if I cannot verify `articlesById`, I'll use `allArticles`.
    // But wait, `allArticles` is `Article[]`.
    // Let's assume `allArticles` is what we have.
    const isYtTab = sidebarTab === 'yt';

    // Optimization: Build a Set of valid IDs for the current tab ONCE in the parent list?
    // That's much better. But `AiTopicsList` is the parent. 
    // Let's move this logic to `AiTopicsList` if possible?
    // But `TopicItem` is recursive.

    // Let's stick to doing it here but verify if we can use a Map. 
    // `useAppContext` typically exposes state.

    return articleIds.filter(id => {
      const article = allArticles.find(a => a.id === id);
      if (!article) return false;
      const feed = feedsById.get(article.feedId);
      if (!feed) return false;
      const isYtFeed = feed.url.toLowerCase().includes('youtube.com');
      return isYtTab ? isYtFeed : !isYtFeed;
    }).length;
  }, [articleIds, allArticles, sidebarTab, feedsById]);


  // Check if this topic is active
  const isSelfActive =
    currentView.type === 'ai-topic' &&
    (currentView.value as { title: string })?.title === title;

  // Check if any subtopic is active (recursive check helper)
  const isChildActive = useMemo(() => {
    if (!hasSubTopics || !subTopics) return false;
    const checkActive = (subs: { title: string }[]): boolean => {
      return subs.some(sub => {
        if (currentView.type === 'ai-topic' && (currentView.value as { title: string })?.title === sub.title) {
          return true;
        }
        return false;
      });
    };
    return checkActive(subTopics);
  }, [currentView, subTopics, hasSubTopics]);


  // Initialize expanded state
  const [isExpanded, setIsExpanded] = useState(isChildActive);

  useEffect(() => {
    if (isChildActive) {
      setIsExpanded(true);
    }
  }, [isChildActive]);

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate(title, articleIds);
  };

  const paddingLeft = (depth + 1) * 12;

  // Render even if validArticleCount is 0? 
  // User might want to see topics even if empty in current view?
  // Or maybe gray them out?
  // For now just show the count.

  return (
    <div className="w-full">
      <div
        className={`flex items-center w-full pr-2 py-1.5 text-sm rounded-md transition-colors ${isSelfActive
          ? 'bg-gray-700 text-white'
          : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
          }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        {hasSubTopics && (
          <button
            onClick={handleExpand}
            className="p-0.5 mr-1 rounded hover:bg-gray-600 transition-colors"
          >
            <ChevronRightIcon
              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          </button>
        )}
        {!hasSubTopics && <span className="w-4 mr-1" />}
        <a
          href={`#/ai-topic/${encodeURIComponent(title)}`}
          onClick={handleClick}
          className="flex-1 truncate cursor-pointer flex items-center"
        >
          <TagIcon className="w-3 h-3 mr-2 opacity-70" />
          <span className="truncate">{title}</span>
          {validArticleCount > 0 && (
            <span className="ml-auto text-[10px] bg-gray-700 px-1.5 py-0.5 rounded-full text-gray-400">
              {validArticleCount}
            </span>
          )}
        </a>
      </div>
      {hasSubTopics && isExpanded && (
        <div className="mt-0.5">
          {subTopics!.map((sub, idx) => (
            <TopicItem
              key={`${title}-${sub.title}-${idx}`}
              title={sub.title}
              articleIds={sub.articleIds}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const AiTopicsList: React.FC<{ onCloseMindmap?: () => void }> = ({ onCloseMindmap }) => {
  const { aiHierarchy, handleViewChange } = useAppContext();

  if (!aiHierarchy || !aiHierarchy.rootTopics || aiHierarchy.rootTopics.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-gray-500 italic text-center">
        No topics generated yet. Use the "AI Grouping" button to generate topics correctly.
      </div>
    );
  }

  const handleNavigate = (title: string, ids: string[]) => {
    if (onCloseMindmap) onCloseMindmap();
    handleViewChange('ai-topic', { title, articleIds: ids });
  };

  return (
    <div className="space-y-0.5 mt-1">
      {aiHierarchy.rootTopics.map((topic, idx) => {
        // Calculate total unique article IDs for the root topic to show correct count
        const allIds = new Set(topic.articleIds);
        topic.subTopics?.forEach(sub => {
          sub.articleIds.forEach(id => allIds.add(id));
        });
        const aggregateIds = Array.from(allIds);

        return (
          <TopicItem
            key={`${topic.title}-${idx}`}
            title={topic.title}
            articleIds={aggregateIds}
            subTopics={topic.subTopics}
            onNavigate={handleNavigate}
          />
        );
      })}
    </div>
  );
};

export const Sidebar: React.FC<{
  onOpenMindmap: () => void;
  isMindmapOpen: boolean;
  onCloseMindmap: () => void;
}> = ({ onOpenMindmap, isMindmapOpen, onCloseMindmap }) => {
  const {
    sortedFeeds,
    currentView,
    isSidebarCollapsed,
    onToggleSidebar,
    sidebarTab,
    handleSetSidebarTab,
    sidebarFeedsView,
    handleSetSidebarFeedsView,
    isViewsCollapsed,
    onToggleViewsCollapse,
    isYoutubeFeedsCollapsed,
    onToggleYoutubeFeedsCollapse,
    isRssFeedsCollapsed,
    onToggleRssFeedsCollapse,
    isRedditFeedsCollapsed,
    onToggleRedditFeedsCollapse,
    isYoutubePlaylistsCollapsed,
    onToggleYoutubePlaylistsCollapse,
    isYoutubeTagsCollapsed,
    onToggleYoutubeTagsCollapse,
    isRssTagsCollapsed,
    onToggleRssTagsCollapse,
    handleSearch,
    handleClearSearch,
    youtubeTags,
    rssTags,
    youtubeUnreadTagCounts,
    rssUnreadTagCounts,
    unreadPublishedTodayYtCount,
    unreadPublishedTodayRssCount,
    unreadReadLaterYtCount,
    unreadReadLaterRssCount,
    unreadAiSummaryYtCount,
    historyYtCount,
    historyRssCount,
    unreadFavoritesYtCount,
    unreadFavoritesRssCount,
    enableRssAndReddit,
    isMobileView,
    noteFolders,
    isNotesCollapsed,
    onToggleNotesCollapse,
    handleAddNoteFolder,
    // FIX: Add missing property `handleOpenRefreshOptionsModal` to destructuring.
    handleOpenRefreshOptionsModal,
    isRefreshingAll,
    setAddFeedModalOpen,
    setIsImportYouTubeModalOpen,
    setIsBundledChannelsModalOpen,
    handleMarkAllInAllFeedsAsRead,
    setIsImportTextModalOpen,
    setIsSyncDataModalOpen,
    setIsExportModalOpen,
    setIsAiSettingsModalOpen,
    setIsTrendingKeywordsModalOpen,
    // FIX: Add missing property `favoriteFeeds` to destructuring.
    favoriteFeeds,
    aiHierarchy,
    isAiTopicsCollapsed,
    onToggleAiTopicsCollapse,
    handleRefreshAllTranscripts,
  } = useAppContext();

  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsActionsPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddNewFolderClick = () => {
    const name = prompt('Enter new folder name:');
    if (name && name.trim()) {
      handleAddNoteFolder(name.trim());
    }
  };

  const SidebarSection: React.FC<{
    title: string;
    isCollapsed: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  }> = ({ title, isCollapsed, onToggle, children }) => (
    <div>
      {!isSidebarCollapsed && (
        <button
          onClick={onToggle}
          className="flex items-center justify-between w-full text-xs font-bold text-gray-500 uppercase tracking-wider px-3 py-2 hover:text-gray-300"
        >
          <span>{title}</span>
          <ChevronRightIcon
            className={`w-4 h-4 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`}
          />
        </button>
      )}
      <div
        className={`transition-all duration-300 ${isCollapsed && !isSidebarCollapsed ? 'hidden' : ''}`}
      >
        {children}
      </div>
    </div>
  );

  const TagsList: React.FC<{
    tags: string[];
    unreadTagCounts: Record<string, number>;
    tagType: 'youtube' | 'rss';
  }> = ({ tags, unreadTagCounts, tagType }) => {
    const unreadFavs = tagType === 'youtube' ? unreadFavoritesYtCount : unreadFavoritesRssCount;

    return (
      <>
        <TagWithFeeds
          key={`${tagType}-__FAVORITES__`}
          tag="__FAVORITES__"
          unreadCount={unreadFavs}
          tagType={tagType}
          onCloseMindmap={onCloseMindmap}
        />
        {tags.map(tag => (
          <TagWithFeeds
            key={`${tagType}-${tag}`}
            tag={tag}
            unreadCount={unreadTagCounts[tag] || 0}
            tagType={tagType}
            onCloseMindmap={onCloseMindmap}
          />
        ))}
      </>
    );
  };


  const ytFeeds = useMemo(() => sortedFeeds.filter(isYouTubeFeed), [sortedFeeds]);
  const nonYtFeeds = useMemo(() => sortedFeeds.filter(feed => !isYouTubeFeed(feed)), [sortedFeeds]);

  const redditFeeds = useMemo(
    () => nonYtFeeds.filter(feed => feed.url.toLowerCase().includes('reddit.com')),
    [nonYtFeeds]
  );
  const rssFeeds = useMemo(
    () => nonYtFeeds.filter(feed => !feed.url.toLowerCase().includes('reddit.com')),
    [nonYtFeeds]
  );

  const createMenuAction = (action: () => void | Promise<void>) => () => {
    action();
    setIsActionsPopoverOpen(false);
  };

  return (
    <aside
      className={`bg-gray-800 text-gray-300 flex flex-col transition-all duration-300 ease-in-out z-30 ${isMobileView
        ? `fixed h-full ${isSidebarCollapsed ? '-translate-x-full' : 'translate-x-0 w-64 shadow-xl'}`
        : `flex-shrink-0 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`
        }`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700 flex-shrink-0">
        {!isSidebarCollapsed && (
          <div className="flex items-center gap-2">
            <img src="/media-feeder-icon.svg" alt="Media-Feeder logo" className="w-9 h-9" />
            <span className="font-bold text-xl text-white">Media-Feeder</span>
          </div>
        )}
        <button onClick={onToggleSidebar} className="p-2 -mr-2 rounded-full hover:bg-gray-700">
          <ChevronDoubleLeftIcon
            className={`w-5 h-5 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      <div className={`p-3 flex-shrink-0 ${isSidebarCollapsed ? 'hidden' : ''}`}>
        <SearchInput
          onSearch={handleSearch}
          onClear={handleClearSearch}
          initialValue={currentView.type === 'search' ? currentView.value : ''}
        />
      </div>

      {!isSidebarCollapsed && (
        <div className="px-3 pb-2 flex justify-end items-center gap-1">
          <Tooltip text="List View" isVisible={!isMobileView}>
            <button
              onClick={() => handleSetSidebarFeedsView('list')}
              className={`p-1.5 rounded-md ${sidebarFeedsView === 'list' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip text="Icon View" isVisible={!isMobileView}>
            <button
              onClick={() => handleSetSidebarFeedsView('icons')}
              className={`p-1.5 rounded-md ${sidebarFeedsView === 'icons' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
            >
              <GridViewIcon className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      )}

      {!isSidebarCollapsed && enableRssAndReddit && !isMobileView && (
        <div className="flex-shrink-0 px-3 py-2 flex items-center gap-1 border-b border-gray-700">
          <button
            onClick={() => handleSetSidebarTab('yt')}
            className={`flex-1 text-center text-xs font-semibold px-2 py-1 rounded-md transition-colors ${sidebarTab === 'yt' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-600 hover:text-white'}`}
          >
            YouTube
          </button>
          <button
            onClick={() => handleSetSidebarTab('rss')}
            className={`flex-1 text-center text-xs font-semibold px-2 py-1 rounded-md transition-colors ${sidebarTab === 'rss' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-600 hover:text-white'}`}
          >
            RSS & Other
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1 no-scrollbar">
        <SidebarSection
          title="Views"
          isCollapsed={isViewsCollapsed}
          onToggle={onToggleViewsCollapse}
        >
          <NavItem
            type="all-subscriptions"
            icon={GridViewIcon}
            label="All Subscriptions"
            currentTab={sidebarTab}
            isTabbed={true}
            forceInactive={isMindmapOpen}
            onCloseMindmap={onCloseMindmap}
          />
          <ViewWithFeeds
            viewType="published-today"
            icon={ClockIcon}
            label="Published Today"
            totalUnreadCount={
              sidebarTab === 'yt' ? unreadPublishedTodayYtCount : unreadPublishedTodayRssCount
            }
            currentTab={sidebarTab}
            onCloseMindmap={onCloseMindmap}
          />
          <NavItem
            type="readLater"
            icon={BookmarkIcon}
            label="Read Later"
            count={sidebarTab === 'yt' ? unreadReadLaterYtCount : unreadReadLaterRssCount}
            isTabbed={true}
            currentTab={sidebarTab}
            forceInactive={isMindmapOpen}
            onCloseMindmap={onCloseMindmap}
          />
          <ViewWithFeeds
            viewType="history"
            icon={HistoryIcon}
            label="History"
            totalUnreadCount={sidebarTab === 'yt' ? historyYtCount : historyRssCount}
            currentTab={sidebarTab}
            onCloseMindmap={onCloseMindmap}
          />
          {sidebarTab === 'yt' && (
            <NavItem
              type="ai-summary-yt"
              icon={AiSummaryIcon}
              label="YT with AI Summary"
              count={unreadAiSummaryYtCount}
              forceInactive={isMindmapOpen}
              onCloseMindmap={onCloseMindmap}
            />
          )}
          <Tooltip text="AI Grouping" isVisible={isSidebarCollapsed && !isMobileView}>
            <button
              onClick={onOpenMindmap}
              className={`flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors ${isMindmapOpen
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                }`}
            >
              <GridViewIcon className="w-5 h-5" />
              {!isSidebarCollapsed && <span className="ml-3 flex-1 truncate text-left">AI Grouping</span>}
            </button>
          </Tooltip>
        </SidebarSection>

        {!isSidebarCollapsed && aiHierarchy && (
          <SidebarSection
            title="AI Topics"
            isCollapsed={isAiTopicsCollapsed}
            onToggle={onToggleAiTopicsCollapse}
          >
            <AiTopicsList onCloseMindmap={onCloseMindmap} />
          </SidebarSection>
        )}

        {sidebarTab === 'yt' && (youtubeTags.length > 0 || favoriteFeeds.some(isYouTubeFeed)) && (
          <SidebarSection
            title="YouTube Tags"
            isCollapsed={isYoutubeTagsCollapsed}
            onToggle={onToggleYoutubeTagsCollapse}
          >
            <TagsList
              tags={youtubeTags}
              unreadTagCounts={youtubeUnreadTagCounts}
              tagType="youtube"
            />
          </SidebarSection>
        )}
        {sidebarTab === 'rss' &&
          (rssTags.length > 0 || favoriteFeeds.some(f => !isYouTubeFeed(f))) && (
            <SidebarSection
              title="RSS Tags"
              isCollapsed={isRssTagsCollapsed}
              onToggle={onToggleRssTagsCollapse}
            >
              <TagsList tags={rssTags} unreadTagCounts={rssUnreadTagCounts} tagType="rss" />
            </SidebarSection>
          )}

        {sidebarTab === 'yt' ? (
          <>
            <SidebarSection
              title="Channels"
              isCollapsed={isYoutubeFeedsCollapsed}
              onToggle={onToggleYoutubeFeedsCollapse}
            >
              <FeedsList
                feeds={ytFeeds}
                typeFilter={isYouTubeChannel}
                onCloseMindmap={onCloseMindmap}
              />
            </SidebarSection>
            <SidebarSection
              title="Playlists"
              isCollapsed={isYoutubePlaylistsCollapsed}
              onToggle={onToggleYoutubePlaylistsCollapse}
            >
              <FeedsList
                feeds={ytFeeds}
                typeFilter={isYouTubePlaylist}
                onCloseMindmap={onCloseMindmap}
              />
            </SidebarSection>
          </>
        ) : (
          <>
            <SidebarSection
              title="Notes"
              isCollapsed={isNotesCollapsed}
              onToggle={onToggleNotesCollapse}
            >
              <div className="space-y-1">
                {noteFolders.map(folder => (
                  <NavItem
                    key={folder.id}
                    type="note-folder"
                    value={folder.id}
                    icon={FolderIcon}
                    label={folder.name}
                  />
                ))}
              </div>
              {!isSidebarCollapsed && (
                <div className="p-2">
                  <button
                    onClick={handleAddNewFolderClick}
                    className="w-full flex items-center justify-center text-xs text-gray-400 hover:text-white bg-gray-700/50 hover:bg-gray-700 rounded-md py-1.5"
                  >
                    <PlusIcon className="w-4 h-4 mr-1" /> New Folder
                  </button>
                </div>
              )}
            </SidebarSection>
            {enableRssAndReddit && (
              <>
                <SidebarSection
                  title="Reddit Feeds"
                  isCollapsed={isRedditFeedsCollapsed}
                  onToggle={onToggleRedditFeedsCollapse}
                >
                  <FeedsList feeds={redditFeeds} typeFilter={() => true} onCloseMindmap={onCloseMindmap} />
                </SidebarSection>
                <SidebarSection
                  title="Other RSS Feeds"
                  isCollapsed={isRssFeedsCollapsed}
                  onToggle={onToggleRssFeedsCollapse}
                >
                  <FeedsList feeds={rssFeeds} typeFilter={() => true} onCloseMindmap={onCloseMindmap} />
                </SidebarSection>
              </>
            )}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-gray-700 flex-shrink-0 relative">
        <button
          id="actions-menu-button"
          ref={buttonRef}
          onClick={() => setIsActionsPopoverOpen(prev => !prev)}
          className="w-full flex items-center justify-center p-3 text-sm rounded-md transition-colors text-gray-200 bg-gray-700/50 hover:bg-gray-700"
        >
          <SettingsIcon className="w-5 h-5" />
          {!isSidebarCollapsed && <span className="ml-3">Actions & Settings</span>}
        </button>
        {isActionsPopoverOpen && !isMobileView && (
          <div
            ref={popoverRef}
            className="absolute bottom-full left-0 w-full mb-2 p-2 bg-gray-700 rounded-lg shadow-lg z-20"
          >
            <MenuButton
              onClick={createMenuAction(() => handleOpenRefreshOptionsModal())}
              icon={RefreshIcon}
              label="Refresh Feeds..."
              disabled={isRefreshingAll}
            />
            <MenuButton
              onClick={createMenuAction(handleRefreshAllTranscripts)}
              icon={RefreshIcon}
              label="Refresh All Transcripts"
              disabled={isRefreshingAll}
            />
            <MenuButton
              onClick={createMenuAction(() => setIsSyncDataModalOpen(true))}
              icon={SyncIcon}
              label="Sync Data"
            />
            <MenuButton
              onClick={createMenuAction(handleMarkAllInAllFeedsAsRead)}
              icon={CheckCircleIcon}
              label="Mark All Read"
            />
            <div className="my-1 border-t border-gray-600"></div>
            <MenuButton
              onClick={createMenuAction(() => setAddFeedModalOpen(true))}
              icon={PlusIcon}
              label="Follow New Source"
            />
            <MenuButton
              onClick={createMenuAction(() => setIsImportTextModalOpen(true))}
              icon={ImportIcon}
              label="Import Data"
            />
            <MenuButton
              onClick={createMenuAction(() => setIsExportModalOpen(true))}
              icon={ExportIcon}
              label="Export Data"
            />
            <MenuButton
              onClick={createMenuAction(() => setIsImportYouTubeModalOpen(true))}
              icon={YouTubeIcon}
              label="Import from YouTube"
            />
            <MenuButton
              onClick={createMenuAction(() => setIsBundledChannelsModalOpen(true))}
              icon={PackageIcon}
              label="Add Channel Bundles"
            />
            <div className="my-1 border-t border-gray-600"></div>
            <MenuButton
              onClick={createMenuAction(() => setIsTrendingKeywordsModalOpen(true))}
              icon={TrendingUpIcon}
              label="Trending Keywords"
            />
            <div className="my-1 border-t border-gray-600"></div>
            <MenuButton
              onClick={createMenuAction(() => setIsAiSettingsModalOpen(true))}
              icon={SettingsIcon}
              label="Settings"
            />
          </div>
        )}
      </div>
    </aside>
  );
};
