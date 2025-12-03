import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { YouTubeIcon, RssIcon } from './icons';

export const AllSubscriptionsTabs: React.FC = () => {
  const {
    // FIX: Corrected property name 'allSubscriptionsTab' to 'sidebarTab' to match the property defined in AppContext.
    sidebarTab,
    // FIX: Corrected property name 'handleSetAllSubscriptionsTab' to 'handleSetSidebarTab' to match the property defined in AppContext.
    handleSetSidebarTab,
    youtubeFeeds,
    rssAndOtherFeeds,
  } = useAppContext();

  const getTabClass = (tab: 'yt' | 'rss') => {
    return `flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
      sidebarTab === tab
        ? 'bg-indigo-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;
  };

  return (
    <div className="flex-shrink-0 bg-gray-800/50 border-b border-gray-700 px-4 py-2 flex items-center gap-2">
      <button onClick={() => handleSetSidebarTab('yt')} className={getTabClass('yt')}>
        <YouTubeIcon className="w-5 h-5" />
        YouTube ({youtubeFeeds.length})
      </button>
      <button onClick={() => handleSetSidebarTab('rss')} className={getTabClass('rss')}>
        <RssIcon className="w-5 h-5" />
        RSS & Other ({rssAndOtherFeeds.length})
      </button>
    </div>
  );
};
