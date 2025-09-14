



import React, { useEffect } from 'react';
import { useAppContext } from './contexts/AppContext';
import { Sidebar } from './components/Sidebar';
import { FeedContent } from './components/FeedContent';
import { AddFeedModal } from './components/AddFeedModal';
import { ArticleModal } from './components/ArticleModal';
import { EditFeedModal } from './components/EditFeedModal';
import { EditTagsModal } from './components/EditTagsModal.tsx';
import { BulkEditTagsModal } from './components/BulkEditTagsModal';
import { DigestModal } from './components/HistorySummaryModal';
import { RecommendationsModal } from './components/RecommendationsModal';
import { RelatedChannelsModal } from './components/RelatedChannelsModal';
import { Toast } from './components/Toast';
import { ZoomInIcon, ZoomOutIcon, PencilIcon, TagIcon, RefreshIcon, StarIcon, TrashIcon, UsersIcon, SparklesIcon, CheckCircleIcon, XIcon, PlusIcon, CheckSquareIcon, XSquareIcon } from './components/icons';
import { FeedGrid } from './components/FeedGrid';
import { SearchInput } from './components/SearchInput';
import { InactiveFeedsContent } from './components/InactiveFeedsContent';
import { ExportModal } from './components/ExportModal';
import { ExportTextModal } from './components/ExportTextModal';
import { AiSettingsModal } from './components/AiSettingsModal';
import { DemoGuide } from './components/DemoGuide';
import { ImportTextModal } from './components/ImportTextModal';
import { DumpContent } from './components/DumpContent';
import { AdvancedInfoModal } from './components/AdvancedInfoModal';
import { TagFilterBar } from './components/TagFilterBar';
import { DigestConfigModal } from './components/DigestConfigModal';
import { ImportYouTubeModal } from './components/ImportYouTubeModal';
import { BundledChannelsModal } from './components/BundledChannelsModal';
import { ClearDataModal } from './components/ClearDataModal';
import { PrivacyPolicyContent } from './components/PrivacyPolicyContent';
import { AboutContent } from './components/AboutContent';
import { EditArticleTagsModal } from './components/EditArticleTagsModal';
import { BulkEditArticleTagsModal } from './components/BulkEditArticleTagsModal';
import { ConfirmAddVideoOrChannelModal } from './components/ConfirmAddVideoOrChannelModal';
import { Homepage } from './components/Homepage';

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
    <div className="fixed bottom-0 left-0 w-full h-1 bg-gray-700/50 z-[9999]">
        <div
            className="h-full bg-indigo-500 transition-all duration-300 ease-linear"
            style={{ width: `${progress}%` }}
        />
    </div>
);

const ResolvingUrlLoader: React.FC = () => (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-[9999]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-lg text-gray-200 font-semibold">Loading shared article...</p>
        <p className="text-sm text-gray-400">Fetching feed content from the web.</p>
    </div>
);

const App: React.FC = () => {
    const {
        hasEnteredApp,
        headerTitle,
        articlesToShow,
        availableTagsForFilter,
        isInitialLoad,
        isRefreshingAll,
        isViewLoading,
        emptyMessage,
        readArticleIds,
        readLaterArticleIds,
        handleToggleReadLater,
        selectedArticle,
        toast,
        setToast,
        contentView,
        currentView,
        sortedFeeds,
        handleSelectFeed,
        unreadCounts,
        gridZoomLevel,
        handleZoomIn,
        handleZoomOut,
        canZoomIn,
        canZoomOut,
        articleZoomLevel,
        handleArticleZoomIn,
        handleArticleZoomOut,
        canArticleZoomIn,
        canArticleZoomOut,
        setFeedToEdit,
        setFeedToEditTags,
        selectedFeedId,
        handleRefreshSingleFeed,
        refreshingFeedId,
        handleToggleFavorite,
        handleDeleteFeed,
        handleSearch,
        handleClearSearch,
        handleOpenRelatedModal,
        handleGenerateDigest,
        handleClearHistory,
        handleClearReadLater,
        handleRefreshCurrentView,
        refreshProgress,
        isDemoMode,
        handleOpenArticle,
        isResolvingArticleUrl,
        selectedArticleIdsForBatch,
        handleClearArticleSelection,
        handleToggleArticleSelection,
        setIsBulkEditArticleTagsModalOpen,
        handleBulkDeleteArticles,
        handleReorderArticles,
        handleSelectAllArticles,
        handleOpenBulkEditForTag,
        handleDeleteTag,
        handleMarkSelectedAsRead,
        handleOpenBulkEditForFavorites,
    } = useAppContext();

    useEffect(() => {
        const body = document.body;
        const isBusy = isInitialLoad || isRefreshingAll || isViewLoading || !!refreshingFeedId;

        if (isBusy) {
            body.classList.add('wait-cursor');
        } else {
            body.classList.remove('wait-cursor');
        }

        return () => {
            body.classList.remove('wait-cursor');
        };
    }, [isInitialLoad, isRefreshingAll, isViewLoading, refreshingFeedId]);

    const currentFeed = contentView === 'articles' && currentView.type === 'feed' && selectedFeedId 
        ? sortedFeeds.find(f => f.id === selectedFeedId) 
        : null;

    const isCurrentFeedRefreshing = !!(currentFeed && refreshingFeedId === currentFeed.id);
    const shouldShowViewRefresh = currentView.type === 'favorites' || currentView.type === 'tag';
    
    const viewsWithTagFilter = ['favorites', 'published-today', 'readLater', 'history'];
    const shouldShowTagFilter = viewsWithTagFilter.includes(currentView.type) && availableTagsForFilter.length > 0;

    const isReorderable = ['feed', 'tag', 'readLater', 'favorites'].includes(currentView.type);
    const handleReorder = (sourceId: string, targetId: string | null) => {
        handleReorderArticles(currentView, sourceId, targetId);
    };

    const areAllVisibleSelected = articlesToShow.length > 0 && articlesToShow.every(a => selectedArticleIdsForBatch.has(a.id));

    if (!hasEnteredApp) {
        return <Homepage />;
    }

    return (
        <div className="flex h-screen bg-gray-900 text-gray-200 font-sans">
            {isResolvingArticleUrl && <ResolvingUrlLoader />}
            {isRefreshingAll && refreshProgress !== null && (
                <ProgressBar progress={refreshProgress} />
            )}
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="flex-shrink-0 bg-gray-800/80 backdrop-blur-sm border-b border-gray-700 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-bold text-gray-100 truncate" title={headerTitle}>{headerTitle}</h1>
                             {contentView === 'articles' && articlesToShow.length > 0 && (
                                <button
                                    onClick={handleSelectAllArticles}
                                    className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                                    title={areAllVisibleSelected ? "Deselect all visible articles" : "Select all visible articles"}
                                >
                                    {areAllVisibleSelected ? <XSquareIcon className="w-5 h-5" /> : <CheckSquareIcon className="w-5 h-5" />}
                                </button>
                            )}
                             {currentFeed && (
                                <div className="flex items-center gap-1">
                                    <button
                                        id="header-refresh-button"
                                        onClick={() => handleRefreshSingleFeed(currentFeed.id)}
                                        disabled={isCurrentFeedRefreshing}
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Refresh Feed"
                                    >
                                        <RefreshIcon className={`w-5 h-5 ${isCurrentFeedRefreshing ? 'animate-spin' : ''}`} />
                                    </button>
                                    <button
                                        onClick={() => handleToggleFavorite(currentFeed.id)}
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                                        title={currentFeed.isFavorite ? 'Unfavorite' : 'Favorite'}
                                    >
                                        <StarIcon className={`w-5 h-5 ${currentFeed.isFavorite ? 'text-yellow-400 fill-current' : ''}`} />
                                    </button>
                                    <button
                                        onClick={() => setFeedToEdit(currentFeed)}
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                                        title="Edit Feed"
                                    >
                                        <PencilIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        id="header-tag-button"
                                        onClick={() => setFeedToEditTags(currentFeed)}
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                                        title="Edit Tags"
                                    >
                                        <TagIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleOpenRelatedModal(currentFeed.id)}
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                                        title="Find Related Feeds"
                                    >
                                        <UsersIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteFeed(currentFeed.id)}
                                        className="p-2 rounded-full text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                        title="Delete Feed"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                            {currentView.type === 'tag' && currentView.value && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleOpenBulkEditForTag(currentView.value)}
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                                        title={`Add feeds to tag #${currentView.value}`}
                                    >
                                        <PlusIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTag(currentView.value)}
                                        className="p-2 rounded-full text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                        title={`Delete tag #${currentView.value}`}
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                             {currentView.type === 'favorites' && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleOpenBulkEditForFavorites()}
                                        className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                                        title="Add feeds to Favorites"
                                    >
                                        <PlusIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                             {shouldShowViewRefresh && (
                                <button
                                    onClick={handleRefreshCurrentView}
                                    disabled={isRefreshingAll}
                                    className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={`Refresh ${headerTitle}`}
                                >
                                    <RefreshIcon className={`w-5 h-5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
                                </button>
                            )}
                             {currentView.type === 'history' && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={handleClearHistory}
                                        disabled={readArticleIds.size === 0}
                                        className="p-2 rounded-full text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Clear History"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                             {currentView.type === 'readLater' && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={handleClearReadLater}
                                        disabled={readLaterArticleIds.size === 0}
                                        className="p-2 rounded-full text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Clear All Read Later Articles"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                         {currentFeed && currentFeed.tags && currentFeed.tags.length > 0 && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                {currentFeed.tags.map(tag => (
                                    <span key={tag} className="px-2 py-0.5 text-xs font-medium bg-gray-700 text-gray-300 rounded-full">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        {currentFeed && currentFeed.description && (
                            <p className="mt-2 text-sm text-gray-400 line-clamp-2" title={currentFeed.description}>
                                {currentFeed.description}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                            onClick={handleGenerateDigest}
                            disabled={contentView !== 'articles' || selectedArticleIdsForBatch.size === 0}
                            className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Create AI Digest from selected videos"
                        >
                            <SparklesIcon className="w-5 h-5" />
                        </button>
                        {contentView === 'feedsGrid' && (
                            <>
                                <button
                                    onClick={handleZoomOut}
                                    disabled={!canZoomOut}
                                    className="p-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Zoom Out"
                                >
                                    <ZoomInIcon className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={handleZoomIn}
                                    disabled={!canZoomIn}
                                    className="p-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Zoom In"
                                >
                                    <ZoomOutIcon className="w-5 h-5" />
                                </button>
                            </>
                        )}
                        {contentView === 'articles' && currentView.type !== 'search' && (
                            <>
                                <button
                                    onClick={handleArticleZoomOut}
                                    disabled={!canArticleZoomOut}
                                    className="p-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Zoom Out"
                                >
                                    <ZoomInIcon className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={handleArticleZoomIn}
                                    disabled={!canArticleZoomIn}
                                    className="p-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Zoom In"
                                >
                                    <ZoomOutIcon className="w-5 h-5" />
                                </button>
                            </>
                        )}
                         {currentView.type === 'search' && (
                            <div className="w-full max-w-sm">
                                <SearchInput
                                    onSearch={handleSearch}
                                    onClear={handleClearSearch}
                                    initialValue={currentView.value || ''}
                                />
                            </div>
                        )}
                    </div>
                </header>

                {shouldShowTagFilter && <TagFilterBar />}

                {contentView === 'feedsGrid' ? (
                    <FeedGrid
                        feeds={sortedFeeds}
                        onSelectFeed={handleSelectFeed}
                        unreadCounts={unreadCounts}
                        gridZoomLevel={gridZoomLevel}
                        isRefreshing={isInitialLoad || isRefreshingAll}
                    />
                ) : contentView === 'inactiveFeeds' ? (
                     <InactiveFeedsContent />
                ) : contentView === 'dump' ? (
                    <DumpContent />
                ) : contentView === 'privacyPolicy' ? (
                    <PrivacyPolicyContent />
                ) : contentView === 'about' ? (
                    <AboutContent />
                ) : (
                    <FeedContent
                        articles={articlesToShow}
                        isLoading={isInitialLoad || isRefreshingAll || isViewLoading}
                        emptyMessage={emptyMessage}
                        onOpenArticle={handleOpenArticle}
                        readArticleIds={readArticleIds}
                        readLaterArticleIds={readLaterArticleIds}
                        onToggleReadLater={handleToggleReadLater}
                        articleZoomLevel={articleZoomLevel}
                        selectedArticleIds={selectedArticleIdsForBatch}
                        onToggleArticleSelection={handleToggleArticleSelection}
                        isReorderable={isReorderable}
                        onReorder={handleReorder}
                    />
                )}
            </main>
            
            {selectedArticleIdsForBatch.size > 0 && contentView === 'articles' && (
                <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg p-4 z-40">
                    <div className="bg-gray-700 rounded-lg shadow-lg p-3 flex items-center justify-between">
                        <span className="text-sm font-semibold">{selectedArticleIdsForBatch.size} items selected</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsBulkEditArticleTagsModalOpen(true)}
                                className="flex items-center gap-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-md transition-colors"
                            >
                                <TagIcon className="w-4 h-4" />
                                Tag Selected
                            </button>
                            <button
                                onClick={handleMarkSelectedAsRead}
                                className="flex items-center gap-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 px-3 py-1.5 rounded-md transition-colors"
                            >
                                <CheckCircleIcon className="w-4 h-4" />
                                Mark as Read
                            </button>
                            <button
                                onClick={handleBulkDeleteArticles}
                                className="flex items-center gap-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-md transition-colors"
                            >
                                <TrashIcon className="w-4 h-4" />
                                Delete Selected
                            </button>
                            <button
                                onClick={handleClearArticleSelection}
                                className="p-1.5 rounded-full text-gray-300 hover:bg-gray-600"
                                title="Clear selection"
                            >
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AddFeedModal />
            <ConfirmAddVideoOrChannelModal />
            <EditFeedModal />
            <EditTagsModal />
            <BulkEditTagsModal />
            <EditArticleTagsModal />
            <BulkEditArticleTagsModal />
            <DigestConfigModal />
            <DigestModal />
            <RecommendationsModal />
            <RelatedChannelsModal />
            <ExportModal />
            <ExportTextModal />
            <AdvancedInfoModal />
            <AiSettingsModal />
            <ImportTextModal />
            <ImportYouTubeModal />
            <BundledChannelsModal />
            <ClearDataModal />

            {selectedArticle && <ArticleModal />}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {isDemoMode && <DemoGuide />}
        </div>
    );
};

export default App;