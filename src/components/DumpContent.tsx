import React, { useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';

export const DumpContent: React.FC = () => {
  const {
    youtubeTags,
    rssTags,
    feedsByTag,
    unreadCounts,
    youtubeUnreadTagCounts,
    rssUnreadTagCounts,
    favoriteFeeds,
    unreadFavoritesYtCount,
    unreadFavoritesRssCount,
    unreadPublishedTodayYtCount,
    unreadPublishedTodayRssCount,
    unreadReadLaterYtCount,
    unreadReadLaterRssCount,
    historyYtCount,
    historyRssCount,
    unreadAiSummaryYtCount,
  } = useAppContext();

  const jsonData = useMemo(() => {
    const isYouTubeFeed = (feed: { url: string }) => feed.url.toLowerCase().includes('youtube.com');
    const ytFavoriteFeeds = favoriteFeeds.filter(isYouTubeFeed);
    const rssFavoriteFeeds = favoriteFeeds.filter(feed => !isYouTubeFeed(feed));

    const views = [
      {
        name: 'All Subscriptions',
        path: '/#/all-subscriptions',
        channels: [],
      },
      {
        name: 'Favorites (YouTube)',
        path: '/#/favorites/yt',
        unreadCount: unreadFavoritesYtCount,
        channels: ytFavoriteFeeds.map(feed => ({
          url: feed.id,
          title: feed.title,
          unreadCount: unreadCounts[feed.id] || 0,
        })),
      },
      {
        name: 'Favorites (RSS)',
        path: '/#/favorites/rss',
        unreadCount: unreadFavoritesRssCount,
        channels: rssFavoriteFeeds.map(feed => ({
          url: feed.id,
          title: feed.title,
          unreadCount: unreadCounts[feed.id] || 0,
        })),
      },
      {
        name: 'Read Later (YouTube)',
        path: '/#/readLater/yt',
        unreadCount: unreadReadLaterYtCount,
        channels: [], // This view is article-based, not channel-based.
      },
      {
        name: 'Read Later (RSS)',
        path: '/#/readLater/rss',
        unreadCount: unreadReadLaterRssCount,
        channels: [],
      },
      {
        name: 'Published Today (YouTube)',
        path: '/#/published-today/yt',
        unreadCount: unreadPublishedTodayYtCount,
        channels: [], // Article-based
      },
      {
        name: 'Published Today (RSS)',
        path: '/#/published-today/rss',
        unreadCount: unreadPublishedTodayRssCount,
        channels: [],
      },
      {
        name: 'History (YouTube)',
        path: '/#/history/yt',
        unreadCount: historyYtCount, // This is count of read articles.
        channels: [],
      },
      {
        name: 'History (RSS)',
        path: '/#/history/rss',
        unreadCount: historyRssCount, // count of read articles.
        channels: [],
      },
      {
        name: 'YT with AI Summary',
        path: '/#/ai-summary-yt',
        unreadCount: unreadAiSummaryYtCount,
        channels: [],
      },
      {
        name: 'Inactive Feeds',
        path: '/#/inactive-feeds',
        channels: [],
      },
      {
        name: 'Dump URLs',
        path: '/#/dump',
        channels: [],
      },
    ];

    const ytTags = youtubeTags.map(tag => ({
      name: tag,
      path: `/#/tag/youtube/${encodeURIComponent(tag)}`,
      unreadCount: youtubeUnreadTagCounts[tag] || 0,
      channels: (feedsByTag.get(tag) || []).filter(isYouTubeFeed).map(feed => ({
        url: feed.id,
        title: feed.title,
        unreadCount: unreadCounts[feed.id] || 0,
      })),
    }));

    const nonYtTags = rssTags.map(tag => ({
      name: tag,
      path: `/#/tag/rss/${encodeURIComponent(tag)}`,
      unreadCount: rssUnreadTagCounts[tag] || 0,
      channels: (feedsByTag.get(tag) || [])
        .filter(feed => !isYouTubeFeed(feed))
        .map(feed => ({
          url: feed.id,
          title: feed.title,
          unreadCount: unreadCounts[feed.id] || 0,
        })),
    }));

    const actions = [
      { name: 'Refresh All Feeds', path: '/#/refresh-all' },
      { name: 'Refresh Favorite Feeds', path: '/#/refresh-favorites' },
      { name: 'Refresh Tagged Feeds', path: '/#/refresh-tagged' },
    ];

    const finalData = { views, youtubeTags: ytTags, rssTags: nonYtTags, actions };

    return JSON.stringify(finalData, null, 2);
  }, [
    youtubeTags,
    rssTags,
    feedsByTag,
    unreadCounts,
    youtubeUnreadTagCounts,
    rssUnreadTagCounts,
    favoriteFeeds,
    unreadFavoritesYtCount,
    unreadFavoritesRssCount,
    unreadPublishedTodayYtCount,
    unreadPublishedTodayRssCount,
    unreadReadLaterYtCount,
    unreadReadLaterRssCount,
    historyYtCount,
    historyRssCount,
    unreadAiSummaryYtCount,
  ]);

  return (
    <div className="flex-1 overflow-auto bg-gray-900 p-6">
      <div className="bg-gray-800 p-4 rounded-lg">
        <pre className="text-gray-300 text-sm whitespace-pre-wrap break-all">{jsonData}</pre>
      </div>
    </div>
  );
};
