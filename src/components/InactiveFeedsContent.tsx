
import React, { useState, useMemo, useEffect } from 'react';
import type { Feed } from '../types';
import { RssIcon, YouTubeIcon, RefreshIcon, TrashIcon, CheckCircleIcon } from './icons';
import { useAppContext } from '../contexts/AppContext';
import { formatRelativeDate } from '../utils/dateUtils';

const FilterButton: React.FC<{
    period: 1 | 3 | 6 | 12 | 'all';
    label: string;
    currentPeriod: 1 | 3 | 6 | 12 | 'all';
    setPeriod: (period: 1 | 3 | 6 | 12 | 'all') => void;
}> = ({ period, label, currentPeriod, setPeriod }) => (
    <button
        onClick={() => setPeriod(period)}
        className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
            currentPeriod === period
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
    >
        {label}
    </button>
);

const FeedRow: React.FC<{
    feed: Feed & { lastPostTimestamp: number };
    isSelected: boolean;
    onToggleSelect: () => void;
    onRefresh: () => void;
    isRefreshing: boolean;
}> = ({ feed, isSelected, onToggleSelect, onRefresh, isRefreshing }) => {
    const [iconError, setIconError] = useState(false);
    const isYouTubeFeed = feed.url.includes('youtube.com');
    const hasError = !!feed.error;
    const hasNeverPosted = feed.lastPostTimestamp === 0 && !hasError;

    return (
        <div className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${isSelected ? 'bg-indigo-900/50' : 'bg-gray-800'}`}>
            <div className="flex-shrink-0">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelect}
                    className="h-5 w-5 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
            </div>
            <div className="flex-shrink-0">
                {feed.iconUrl && !iconError ? (
                    <img src={feed.iconUrl} alt="" className="w-10 h-10 rounded-full bg-gray-700 object-cover" onError={() => setIconError(true)} />
                ) : (
                    isYouTubeFeed ? <YouTubeIcon className="w-10 h-10 text-red-600" /> : <RssIcon className="w-10 h-10 text-gray-400" />
                )}
            </div>
            <div className="flex-grow min-w-0">
                <h3 className={`font-bold text-lg text-gray-100 truncate ${hasError ? 'text-red-400' : ''}`} title={feed.title}>{feed.title}</h3>
                <p className="text-sm text-gray-400 truncate">
                    {hasError ? <span className="font-semibold" title={feed.error ?? ''}>{feed.error}</span> :
                     hasNeverPosted ? "Never posted" : `Last post: ${formatRelativeDate(feed.lastPostTimestamp)}`
                    }
                </p>
            </div>
            <div className="flex-shrink-0">
                <button
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Refresh Feed"
                >
                    <RefreshIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>
        </div>
    );
};

export const InactiveFeedsContent: React.FC = () => {
    const {
        inactiveFeeds,
        inactivePeriod,
        setInactivePeriod,
        handleRefreshSingleFeed,
        handleBulkDeleteFeeds,
        refreshingFeedId,
        handleViewChange,
    } = useAppContext();

    const [selectedFeedIds, setSelectedFeedIds] = useState<Set<string>>(new Set());

    const feeds = inactiveFeeds; // The context already filters based on `inactivePeriod`

    useEffect(() => {
        // Clear selection when the list of feeds changes (e.g., due to filter change)
        setSelectedFeedIds(new Set());
    }, [feeds]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedFeedIds(e.target.checked ? new Set(feeds.map(f => f.id)) : new Set());
    };
    
    const handleToggleSelection = (feedId: string) => {
        setSelectedFeedIds(prev => {
            const newSet = new Set(prev);
            newSet.has(feedId) ? newSet.delete(feedId) : newSet.add(feedId);
            return newSet;
        });
    };

    const handleBulkDelete = () => {
        if (selectedFeedIds.size > 0) {
            handleBulkDeleteFeeds(selectedFeedIds);
            setSelectedFeedIds(new Set());
        }
    };
    
    const isAllSelected = useMemo(() => feeds.length > 0 && selectedFeedIds.size === feeds.length, [feeds, selectedFeedIds]);
    
    const introText = useMemo(() => {
        if (inactivePeriod === 'all') {
            return "Showing all feeds that might be inactive. This includes feeds with errors, no posts, or those that haven't updated in over a month.";
        }
        const periodMap = { 1: '1 month', 3: '3 months', 6: '6 months', 12: '1 year' };
        return `These feeds haven't posted anything in over ${periodMap[inactivePeriod]}. You can refresh them to check for updates or unsubscribe to clean up your feed list.`;
    }, [inactivePeriod]);

    return (
        <div className="flex-1 overflow-y-auto bg-gray-900 p-6 flex flex-col">
            <div className="max-w-4xl mx-auto w-full flex-grow flex flex-col">
                <div className="text-center mb-6 flex-shrink-0">
                    <p className="text-gray-400 mb-4">{introText}</p>
                    <div className="flex justify-center items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-500 font-semibold">Show inactive for:</span>
                        <FilterButton period="all" label="All" currentPeriod={inactivePeriod} setPeriod={setInactivePeriod} />
                        <FilterButton period={1} label="1m" currentPeriod={inactivePeriod} setPeriod={setInactivePeriod} />
                        <FilterButton period={3} label="3m" currentPeriod={inactivePeriod} setPeriod={setInactivePeriod} />
                        <FilterButton period={6} label="6m" currentPeriod={inactivePeriod} setPeriod={setInactivePeriod} />
                        <FilterButton period={12} label="1yr" currentPeriod={inactivePeriod} setPeriod={setInactivePeriod} />
                        <button
                            onClick={() => handleViewChange('all-subscriptions')}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-indigo-600 text-white hover:bg-indigo-500"
                        >
                           <CheckCircleIcon className="w-5 h-5" /> Done
                        </button>
                    </div>
                </div>

                {feeds.length === 0 ? (
                     <div className="flex-grow flex items-center justify-center text-center text-gray-500">
                        No feeds match this inactivity period.
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-4 p-3 bg-gray-900/70 backdrop-blur-sm border-y border-gray-700 sticky top-0 z-10 flex-shrink-0">
                            <input
                                id="select-all"
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={handleSelectAll}
                                className="h-5 w-5 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                            />
                             <label htmlFor="select-all" className="text-sm font-semibold text-gray-300 flex-grow">
                                Select All ({selectedFeedIds.size} / {feeds.length})
                            </label>
                            <button
                                onClick={handleBulkDelete}
                                disabled={selectedFeedIds.size === 0}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-500 disabled:bg-red-400/50 disabled:cursor-not-allowed"
                            >
                                <TrashIcon className="w-4 h-4" />
                                Unsubscribe Selected
                            </button>
                        </div>
                        <div className="space-y-4 pt-4 flex-grow">
                            {feeds.map(feed => (
                                <FeedRow
                                    key={feed.id}
                                    feed={feed}
                                    isSelected={selectedFeedIds.has(feed.id)}
                                    onToggleSelect={() => handleToggleSelection(feed.id)}
                                    onRefresh={() => handleRefreshSingleFeed(feed.id)}
                                    isRefreshing={refreshingFeedId === feed.id}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
