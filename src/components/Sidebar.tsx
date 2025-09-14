import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { PlusIcon, RssIcon, HistoryIcon, TrashIcon, ExportIcon, ImportIcon, ClockIcon, StarIcon, SettingsIcon, YouTubeIcon, TagIcon, TagsIcon, ChevronDoubleLeftIcon, RefreshIcon, AlertTriangleIcon, ChevronRightIcon, BookmarkIcon, CheckCircleIcon, GridViewIcon, RedditIcon, YouTubePlaylistIcon, SparklesIcon, PackageIcon, InfoIcon } from './icons';
import { SearchInput } from './SearchInput';
import type { Feed } from '../types';


const Tooltip: React.FC<{ text: string; isVisible: boolean; children: React.ReactNode }> = ({ text, isVisible, children }) => {
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

const isYouTubePlaylist = (feed: Feed) => feed.id.includes('/playlist?list=') || feed.id.includes('playlist_id=');
const isYouTubeChannel = (feed: Feed) => feed.url.includes('youtube.com') && !isYouTubePlaylist(feed);

export const Sidebar: React.FC = () => {
    const {
        sortedFeeds, allTags, unreadCounts, selectedFeedId, currentView, handleSelectFeed,
        handleViewChange,
        handleOpenClearDataModal, handleMarkAllInAllFeedsAsRead,
        isSidebarCollapsed, onToggleSidebar, isViewsCollapsed, onToggleViewsCollapse,
        isYoutubeFeedsCollapsed, onToggleYoutubeFeedsCollapse, isRssFeedsCollapsed, onToggleRssFeedsCollapse,
        isRedditFeedsCollapsed, onToggleRedditFeedsCollapse, 
        isYoutubePlaylistsCollapsed, onToggleYoutubePlaylistsCollapse,
        isTagsCollapsed, onToggleTagsCollapse, onToggleTagExpansion, expandedTags, feedsByTag,
        isFavoritesCollapsed, onToggleFavoritesCollapse, favoriteFeeds, unreadFavoritesCount,
        handleRefreshAllFeeds, handleRefreshFavorites, isRefreshingAll,
        handleSearch, handleClearSearch,
        handleOpenBulkEdit,
        setAddFeedModalOpen, 
        setIsExportModalOpen,
        setIsImportTextModalOpen,
        unreadTagCounts,
        setIsAiSettingsModalOpen,
        startDemo,
        setIsImportYouTubeModalOpen,
        setIsBundledChannelsModalOpen,
    } = useAppContext();

    const [isActionsMenuOpen, setActionsMenuOpen] = useState(false);
    const [isAdvancedMenuCollapsed, setAdvancedMenuCollapsed] = useState(true);
    const actionsMenuRef = useRef<HTMLDivElement>(null);
    const [feedIconErrors, setFeedIconErrors] = useState<Set<string>>(new Set());

    const createMenuAction = (action: (() => void) | (() => Promise<void>)) => {
        return () => {
            action();
            setActionsMenuOpen(false);
        };
    };
    
    useEffect(() => {
        if (isSidebarCollapsed) {
            setActionsMenuOpen(false);
        }
    }, [isSidebarCollapsed]);

    useEffect(() => {
        // Reset errors when the list of feeds changes to allow for retries on refresh
        setFeedIconErrors(new Set());
    }, [sortedFeeds]);

    const handleIconError = (feedId: string) => {
        setFeedIconErrors(prev => new Set(prev).add(feedId));
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
                setActionsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const navButtonClass = (viewType: string, value?: string) => {
        const isActive = currentView.type === viewType && (value ? currentView.value === value : true);
        return `flex items-center w-full py-1 mb-1 rounded-md text-sm font-medium transition-colors duration-150 ${isSidebarCollapsed ? 'px-2 justify-center' : 'px-3'} ${
            isActive ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-300 hover:bg-gray-700 hover:text-gray-100'
        }`;
    }
    const menuButtonClass = "w-full flex items-center px-3 py-2 text-sm text-gray-200 hover:bg-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed";
    
    const isRedditUrl = (url: string) => url.includes('reddit.com');

    const youtubePlaylistFeeds = useMemo(() => sortedFeeds.filter(isYouTubePlaylist), [sortedFeeds]);
    const youtubeChannelFeeds = useMemo(() => sortedFeeds.filter(isYouTubeChannel), [sortedFeeds]);
    const redditFeeds = useMemo(() => sortedFeeds.filter(f => isRedditUrl(f.url)), [sortedFeeds]);
    const rssFeeds = useMemo(() => sortedFeeds.filter(f => !isYouTubeChannel(f) && !isYouTubePlaylist(f) && !isRedditUrl(f.url)), [sortedFeeds]);


    const renderFeedItem = (feed: Feed) => {
        const isYouTubeChannelFeed = isYouTubeChannel(feed);
        const isYouTubePlaylistFeed = isYouTubePlaylist(feed);
        const isRedditFeed = isRedditUrl(feed.url);
        const isActive = currentView.type === 'feed' && selectedFeedId === feed.id;
        const isFavorite = !!feed.isFavorite;
        const hasError = !!feed.error;
        const unreadCount = unreadCounts[feed.id] || 0;

        return (
            <li key={feed.id}>
                <Tooltip text={hasError ? `${feed.title} (${feed.error})` : feed.title} isVisible={isSidebarCollapsed}>
                    <div onClick={() => handleSelectFeed(feed.id)} className={`flex items-center mb-1 rounded-md text-sm font-medium transition-colors duration-150 cursor-pointer w-full ${isSidebarCollapsed ? 'p-2 justify-center' : 'py-1 px-3'} ${isActive ? 'bg-indigo-500/20' : 'hover:bg-gray-700'}`}>
                        <div className="relative">
                            {feed.iconUrl && !feedIconErrors.has(feed.id) ? (
                                <img src={feed.iconUrl} alt="" className="w-5 h-5 rounded-full flex-shrink-0 bg-gray-700 object-cover" onError={() => handleIconError(feed.id)} />
                            ) : isRedditFeed ? (
                                <RedditIcon className="w-5 h-5 flex-shrink-0 text-orange-500" />
                            ) : isYouTubePlaylistFeed ? (
                                <YouTubePlaylistIcon className="w-5 h-5 flex-shrink-0 text-red-500" />
                            ) : isYouTubeChannelFeed ? (
                                <YouTubeIcon className="w-5 h-5 flex-shrink-0 text-red-600" />
                            ) : (
                                <RssIcon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-indigo-400' : ''} ${hasError ? 'text-red-400' : 'text-gray-300'}`} />
                            )}
                            {isFavorite && <StarIcon className="absolute -top-1 -right-1 w-3 h-3 text-yellow-400 fill-current"/>}
                            {isSidebarCollapsed && unreadCount > 0 && <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-gray-800" />}
                        </div>
                        <span className={`truncate flex-1 text-left whitespace-nowrap ${isSidebarCollapsed ? 'hidden' : 'inline ml-3'} ${isActive ? 'text-indigo-300' : ''} ${hasError ? 'text-red-400' : 'text-gray-200'}`}>{feed.title}</span>
                        {!isSidebarCollapsed && (hasError ? <AlertTriangleIcon className="w-5 h-5 ml-auto text-red-500 flex-shrink-0" /> : unreadCount > 0 && <span className="ml-auto flex items-center justify-center bg-indigo-600 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] flex-shrink-0">{unreadCount}</span>)}
                    </div>
                </Tooltip>
            </li>
        );
    };


    return (
        <aside className={`flex-shrink-0 bg-gray-800 flex flex-col border-r border-gray-700 transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-72'}`}>
            <div className={`px-4 pt-4 mb-4 ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
                <SearchInput onSearch={handleSearch} onClear={handleClearSearch} />
            </div>
            
            <nav className={`flex-1 flex flex-col overflow-y-auto min-h-0 px-2`}>
                <div>
                    <button onClick={onToggleViewsCollapse} disabled={isSidebarCollapsed} className={`w-full flex items-center justify-between mb-1 rounded-md transition-colors ${!isSidebarCollapsed && 'hover:bg-gray-700/50'} ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
                        <h2 className={`text-sm font-semibold text-gray-500 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center w-full' : ''}`}>{isSidebarCollapsed ? 'V' : 'Views'}</h2>
                        {!isSidebarCollapsed && <ChevronRightIcon className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${!isViewsCollapsed ? 'rotate-90' : ''}`} />}
                    </button>
                    {!isSidebarCollapsed && !isViewsCollapsed && (
                        <div>
                            <Tooltip text="All Subscriptions" isVisible={isSidebarCollapsed}><button onClick={() => handleViewChange('all-subscriptions')} className={navButtonClass('all-subscriptions')}><GridViewIcon className="w-5 h-5 flex-shrink-0" /><span className={`ml-3 whitespace-nowrap ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>All Subscriptions</span></button></Tooltip>
                            <Tooltip text="Published Today" isVisible={isSidebarCollapsed}><button onClick={() => handleViewChange('published-today')} className={navButtonClass('published-today')}><ClockIcon className="w-5 h-5 flex-shrink-0" /><span className={`ml-3 whitespace-nowrap ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>Published Today</span></button></Tooltip>
                            <Tooltip text="Read Later" isVisible={isSidebarCollapsed}><button onClick={() => handleViewChange('readLater')} className={navButtonClass('readLater')}><BookmarkIcon className="w-5 h-5 flex-shrink-0" /><span className={`ml-3 whitespace-nowrap ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>Read Later</span></button></Tooltip>
                            <Tooltip text="History" isVisible={isSidebarCollapsed}><button onClick={() => handleViewChange('history')} className={navButtonClass('history')}><HistoryIcon className="w-5 h-5 flex-shrink-0" /><span className={`ml-3 whitespace-nowrap ${isSidebarCollapsed ? 'hidden' : 'inline'}`}>History</span></button></Tooltip>
                        </div>
                    )}
                </div>

                <div className={`flex-1 overflow-y-auto min-h-0 ${isSidebarCollapsed ? 'hidden' : ''}`}>
                    <div className="mt-6">
                        <button onClick={onToggleTagsCollapse} disabled={isSidebarCollapsed} className={`w-full flex items-center justify-between mb-1 rounded-md transition-colors ${!isSidebarCollapsed && 'hover:bg-gray-700/50'} ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
                            <h2 className={`text-sm font-semibold text-gray-500 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center w-full' : ''}`}>{isSidebarCollapsed ? 'T' : 'Tags'}</h2>
                            {!isSidebarCollapsed && <ChevronRightIcon className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${!isTagsCollapsed ? 'rotate-90' : ''}`} />}
                        </button>
                        {!isSidebarCollapsed && !isTagsCollapsed && (
                            <div className="space-y-1">
                                <div>
                                    <div
                                        onClick={() => handleViewChange('favorites')}
                                        className={`group relative flex items-center w-full rounded-md cursor-pointer transition-colors duration-150 ${currentView.type === 'favorites' ? 'bg-indigo-500/20' : 'hover:bg-gray-700'}`}
                                    >
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onToggleFavoritesCollapse(); }}
                                            className={`p-2 text-gray-400 hover:text-white ${currentView.type === 'favorites' ? 'text-indigo-400' : ''}`}
                                            aria-label={isFavoritesCollapsed ? "Expand Favorites" : "Collapse Favorites"}
                                        >
                                            <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${!isFavoritesCollapsed ? 'rotate-90' : ''}`} />
                                        </button>
                                        <div className="flex items-center flex-1 min-w-0 py-1 pr-3">
                                            <StarIcon className={`w-5 h-5 flex-shrink-0 ${currentView.type === 'favorites' ? 'text-indigo-400' : 'text-gray-300'}`} />
                                            <span className={`truncate ml-2 text-sm font-medium ${currentView.type === 'favorites' ? 'text-indigo-300' : 'text-gray-200'}`}>Favorites</span>
                                            {unreadFavoritesCount > 0 && (
                                                <span className="ml-auto flex items-center justify-center bg-indigo-600 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] flex-shrink-0">{unreadFavoritesCount}</span>
                                            )}
                                        </div>
                                    </div>
                                    {!isFavoritesCollapsed && (
                                        <ul className="pl-6 pr-2 pt-1 pb-1 space-y-1">
                                            {favoriteFeeds.length > 0
                                                ? favoriteFeeds.map(renderFeedItem)
                                                : <li className="px-3 py-1 text-xs text-gray-500 italic">No favorited feeds.</li>
                                            }
                                        </ul>
                                    )}
                                </div>
                                {allTags.map(tag => {
                                    const isExpanded = expandedTags.has(tag);
                                    const unreadCount = unreadTagCounts[tag] || 0;
                                    const feedsForTag = feedsByTag.get(tag) || [];

                                    return (
                                        <div key={tag}>
                                            <div
                                                onClick={() => handleViewChange('tag', tag)}
                                                className={`group relative flex items-center w-full rounded-md cursor-pointer transition-colors duration-150 ${currentView.type === 'tag' && currentView.value === tag ? 'bg-indigo-500/20' : 'hover:bg-gray-700'}`}
                                            >
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onToggleTagExpansion(tag); }}
                                                    className={`p-2 text-gray-400 hover:text-white ${currentView.type === 'tag' && currentView.value === tag ? 'text-indigo-400' : ''}`}
                                                    aria-label={isExpanded ? `Collapse ${tag}` : `Expand ${tag}`}
                                                >
                                                    <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                                </button>
                                                <div className="flex items-center flex-1 min-w-0 py-1 pr-3">
                                                    <TagIcon className={`w-5 h-5 flex-shrink-0 ${currentView.type === 'tag' && currentView.value === tag ? 'text-indigo-400' : 'text-gray-300'}`} />
                                                    <span className={`truncate ml-2 text-sm font-medium ${currentView.type === 'tag' && currentView.value === tag ? 'text-indigo-300' : 'text-gray-200'}`}>#{tag}</span>
                                                    {unreadCount > 0 && (
                                                        <span className="ml-auto flex items-center justify-center bg-indigo-600 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] flex-shrink-0">{unreadCount}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <ul className="pl-6 pr-2 pt-1 pb-1 space-y-1">
                                                    {feedsForTag.length > 0
                                                        ? feedsForTag.map(renderFeedItem)
                                                        : <li className="px-3 py-1 text-xs text-gray-500 italic">No feeds with this tag.</li>
                                                    }
                                                </ul>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    
                    {youtubeChannelFeeds.length > 0 && (
                        <div className="mt-6">
                            <button onClick={onToggleYoutubeFeedsCollapse} disabled={isSidebarCollapsed} className={`w-full flex items-center justify-between mb-1 rounded-md transition-colors ${!isSidebarCollapsed && 'hover:bg-gray-700/50'} ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
                                <h2 className={`text-sm font-semibold text-gray-500 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center w-full' : ''}`}>{isSidebarCollapsed ? 'YTC' : 'YT Channels'}</h2>
                                {!isSidebarCollapsed && <ChevronRightIcon className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${!isYoutubeFeedsCollapsed ? 'rotate-90' : ''}`} />}
                            </button>
                            {!isSidebarCollapsed && !isYoutubeFeedsCollapsed && (
                                <ul>
                                    {youtubeChannelFeeds.map(renderFeedItem)}
                                </ul>
                            )}
                        </div>
                    )}

                    {youtubePlaylistFeeds.length > 0 && (
                        <div className="mt-6">
                            <button onClick={onToggleYoutubePlaylistsCollapse} disabled={isSidebarCollapsed} className={`w-full flex items-center justify-between mb-1 rounded-md transition-colors ${!isSidebarCollapsed && 'hover:bg-gray-700/50'} ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
                                <h2 className={`text-sm font-semibold text-gray-500 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center w-full' : ''}`}>{isSidebarCollapsed ? 'YLP' : 'YT Playlists'}</h2>
                                {!isSidebarCollapsed && <ChevronRightIcon className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${!isYoutubePlaylistsCollapsed ? 'rotate-90' : ''}`} />}
                            </button>
                            {!isSidebarCollapsed && !isYoutubePlaylistsCollapsed && (
                                <ul>
                                    {youtubePlaylistFeeds.map(renderFeedItem)}
                                </ul>
                            )}
                        </div>
                    )}
                    
                    {redditFeeds.length > 0 && (
                        <div className="mt-6">
                            <button onClick={onToggleRedditFeedsCollapse} disabled={isSidebarCollapsed} className={`w-full flex items-center justify-between mb-1 rounded-md transition-colors ${!isSidebarCollapsed && 'hover:bg-gray-700/50'} ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
                                <h2 className={`text-sm font-semibold text-gray-500 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center w-full' : ''}`}>{isSidebarCollapsed ? 'RD' : 'Reddit'}</h2>
                                {!isSidebarCollapsed && <ChevronRightIcon className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${!isRedditFeedsCollapsed ? 'rotate-90' : ''}`} />}
                            </button>
                            {!isSidebarCollapsed && !isRedditFeedsCollapsed && (
                                <ul>
                                    {redditFeeds.map(renderFeedItem)}
                                </ul>
                            )}
                        </div>
                    )}

                    {rssFeeds.length > 0 && (
                        <div className="mt-6">
                            <button onClick={onToggleRssFeedsCollapse} disabled={isSidebarCollapsed} className={`w-full flex items-center justify-between mb-1 rounded-md transition-colors ${!isSidebarCollapsed && 'hover:bg-gray-700/50'} ${isSidebarCollapsed ? 'px-2' : 'px-3'}`}>
                                <h2 className={`text-sm font-semibold text-gray-500 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center w-full' : ''}`}>{isSidebarCollapsed ? 'RSS' : 'RSS Feeds'}</h2>
                                {!isSidebarCollapsed && <ChevronRightIcon className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${!isRssFeedsCollapsed ? 'rotate-90' : ''}`} />}
                            </button>
                            {!isSidebarCollapsed && !isRssFeedsCollapsed && (
                                <ul>
                                    {rssFeeds.map(renderFeedItem)}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

            </nav>

            <div className="p-2 border-t border-gray-700 mt-auto">
                <div className={`relative ${isSidebarCollapsed ? 'hidden' : ''}`} ref={actionsMenuRef}>
                    <button id="actions-menu-button" onClick={() => setActionsMenuOpen(prev => !prev)} className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-md">
                        <div className="flex items-center">
                            <SettingsIcon className="w-5 h-5" />
                            <span className="ml-3">Actions & Settings</span>
                        </div>
                        <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${isActionsMenuOpen ? 'rotate-90' : ''}`} />
                    </button>
                    {isActionsMenuOpen && (
                        <div className="absolute bottom-full mb-2 w-full bg-gray-900 shadow-lg rounded-md p-2 border border-gray-700 z-20">
                            <button onClick={createMenuAction(handleRefreshAllFeeds)} disabled={isRefreshingAll} className={menuButtonClass}><RefreshIcon className={`w-4 h-4 mr-2 ${isRefreshingAll ? 'animate-spin' : ''}`}/> Refresh All Feeds</button>
                            <button onClick={createMenuAction(handleRefreshFavorites)} disabled={isRefreshingAll || favoriteFeeds.length === 0} className={menuButtonClass}><RefreshIcon className={`w-4 h-4 mr-2 ${isRefreshingAll ? 'animate-spin' : ''}`}/> Refresh Favorites</button>
                            <div className="my-1 border-t border-gray-700"></div>
                            <button onClick={createMenuAction(() => setAddFeedModalOpen(true))} className={menuButtonClass}><PlusIcon className="w-4 h-4 mr-2"/> Follow New Source</button>
                            <button onClick={createMenuAction(() => setIsImportYouTubeModalOpen(true))} className={menuButtonClass}><YouTubeIcon className="w-4 h-4 mr-2"/> Import from YouTube</button>
                            <button onClick={createMenuAction(() => setIsBundledChannelsModalOpen(true))} className={menuButtonClass}><PackageIcon className="w-4 h-4 mr-2"/> Add Channel Bundles</button>
                            <div className="my-1 border-t border-gray-700"></div>
                            <button onClick={createMenuAction(handleMarkAllInAllFeedsAsRead)} className={menuButtonClass}><CheckCircleIcon className="w-4 h-4 mr-2"/> Mark Everything as Read</button>
                            <div className="my-1 border-t border-gray-700"></div>
                             <button onClick={() => setAdvancedMenuCollapsed(p => !p)} className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:bg-gray-600 rounded-md">
                                <span>Advanced</span>
                                <ChevronRightIcon className={`w-4 h-4 transition-transform duration-200 ${!isAdvancedMenuCollapsed ? 'rotate-90' : ''}`} />
                            </button>
                            {!isAdvancedMenuCollapsed && (
                                <div className="pl-2 pt-1">
                                    <div className="my-1 border-t border-gray-700"></div>
                                    <button onClick={createMenuAction(startDemo)} className="w-full flex items-center px-3 py-2 text-sm text-indigo-400 hover:bg-gray-600 rounded-md"><SparklesIcon className="w-4 h-4 mr-2"/> Run Demo</button>
                                    <div className="my-1 border-t border-gray-700"></div>
                                    <button onClick={createMenuAction(() => setIsAiSettingsModalOpen(true))} className={menuButtonClass}><SettingsIcon className="w-4 h-4 mr-2"/> Settings</button>
                                    <div className="my-1 border-t border-gray-700"></div>
                                    <button onClick={createMenuAction(handleOpenBulkEdit)} className={menuButtonClass}><TagsIcon className="w-4 h-4 mr-2"/> Bulk Edit Tags</button>
                                    <div className="my-1 border-t border-gray-700"></div>
                                    <button onClick={createMenuAction(() => setIsImportTextModalOpen(true))} className={menuButtonClass}><ImportIcon className="w-4 h-4 mr-2"/> Import Data</button>
                                    <button onClick={createMenuAction(() => setIsExportModalOpen(true))} className={menuButtonClass}><ExportIcon className="w-4 h-4 mr-2"/> Export Data</button>
                                    <div className="my-1 border-t border-gray-700"></div>
                                    <button onClick={createMenuAction(() => handleViewChange('about'))} className={menuButtonClass}><InfoIcon className="w-4 h-4 mr-2"/> About</button>
                                    <button onClick={createMenuAction(() => handleViewChange('privacy-policy'))} className={menuButtonClass}><InfoIcon className="w-4 h-4 mr-2"/> Privacy Policy</button>
                                    <div className="my-1 border-t border-gray-700"></div>
                                    <button onClick={createMenuAction(handleOpenClearDataModal)} className="w-full flex items-center px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 rounded-md"><TrashIcon className="w-4 h-4 mr-2"/> Clear All Data</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className={`pt-2 w-full cursor-pointer ${isSidebarCollapsed ? 'hidden' : 'flex justify-center'}`} onClick={onToggleSidebar}>
                    <Tooltip text="Collapse Sidebar" isVisible={!isSidebarCollapsed}>
                        <ChevronDoubleLeftIcon className="w-5 h-5 text-gray-500 hover:text-white" />
                    </Tooltip>
                </div>
                <div className={`py-2 w-full cursor-pointer ${!isSidebarCollapsed ? 'hidden' : 'flex justify-center'}`} onClick={onToggleSidebar}>
                    <Tooltip text="Expand Sidebar" isVisible={isSidebarCollapsed}>
                        <ChevronRightIcon className="w-5 h-5 text-gray-500 hover:text-white" />
                    </Tooltip>
                </div>
            </div>
        </aside>
    );
};