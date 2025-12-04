import React, { useEffect } from 'react';
import { useAppContext } from './contexts/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ErrorFallback } from './components/ErrorFallback';
import { Sidebar } from './components/Sidebar';
import { FeedContent, ArticleReaderView } from './components/FeedContent';
import { AddFeedModal } from './components/AddFeedModal';
import { ArticleModal } from './components/ArticleModal';
import { EditFeedModal } from './components/EditFeedModal';
import { EditTagsModal } from './components/EditTagsModal';
import { BulkEditTagsModal } from './components/BulkEditTagsModal';
import { DigestModal } from './components/HistorySummaryModal';
import { RecommendationsModal } from './components/RecommendationsModal';
import { RelatedChannelsModal } from './components/RelatedChannelsModal';
import { Toast } from './components/Toast';
import {
  ZoomInIcon,
  ZoomOutIcon,
  PencilIcon,
  TagIcon,
  RefreshIcon,
  StarIcon,
  TrashIcon,
  UsersIcon,
  SparklesIcon,
  CheckCircleIcon,
  XIcon,
  PlusIcon,
  CheckSquareIcon,
  XSquareIcon,
  ListIcon,
  GridViewIcon,
  FileTextIcon,
  BookOpenIcon,
  SaveIcon,
  AiSummaryIcon,
} from './components/icons';
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
import { MindmapModal } from './components/MindmapModal';
import { BundledChannelsModal } from './components/BundledChannelsModal';
import { ClearDataModal } from './components/ClearDataModal';
import { PrivacyPolicyContent } from './components/PrivacyPolicyContent';
import { AboutContent } from './components/AboutContent';
import { EditArticleTagsModal } from './components/EditArticleTagsModal';
import { BulkEditArticleTagsModal } from './components/BulkEditArticleTagsModal';
import { ConfirmAddVideoOrChannelModal } from './components/ConfirmAddVideoOrChannelModal';
import { Homepage } from './components/Homepage';
import { HelpContent } from './components/HelpContent';
import { BottomNavBar } from './components/BottomNavBar';
import { SyncDataModal } from './components/SyncDataModal';
import { ActionsMenuModal } from './components/ActionsMenuModal';
import { NoteEditorModal } from './components/NoteEditorModal';
import { NotesContent } from './components/NotesContent';
import TrendingKeywordsModal from './components/TrendingKeywordsModal';
import { EpubSettingsModal } from './components/EpubSettingsModal';
import { RefreshOptionsModal } from './components/RefreshOptionsModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';

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
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = React.useState(false);
  const [isMindmapModalOpen, setIsMindmapModalOpen] = React.useState(false);
  const [selectedArticleIndex, setSelectedArticleIndex] = React.useState<number>(-1);

  const {
    hasEnteredApp,
    headerTitle,
    articlesToShow,
    allArticles,
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
    articleViewMode,
    setArticleViewMode,
    setFeedToEdit,
    setFeedToEditTags,
    selectedFeedId,
    handleRefreshSingleFeed,
    handleRefreshCurrentView,
    refreshingFeedId,
    handleToggleFavorite,
    handleDeleteFeed,
    handleSearch,
    handleClearSearch,
    handleOpenRelatedModal,
    handleGenerateDigest,
    handleClearHistory,
    handleClearReadLater,
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
    handleRenameTag,
    handleMarkSelectedAsRead,
    handleOpenBulkEditForFavorites,
    feedsForGrid,
    isMobileView,
    isSidebarCollapsed,
    onToggleSidebar,
    handleGenerateEbook,
    isGeneratingEbook,
    isSavingViewAsNote,
    handleSaveViewAsNote,
    isSavingSelectionAsNote,
    handleSaveSelectionAsNote,
    isGeneratingEbookFromView,
    handleGenerateEbookFromView,
    isGeneratingSummaries,
    handleGenerateSummariesForSelected,
    handleGenerateSummariesForView,
    summaryGenerationProgress,
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

  // Variable declarations needed by keyboard shortcuts
  const currentFeed =
    contentView === 'articles' && currentView.type === 'feed' && selectedFeedId
      ? sortedFeeds.find(f => f.id === selectedFeedId)
      : null;

  const isCurrentFeedRefreshing = !!(currentFeed && refreshingFeedId === currentFeed.id);
  const shouldShowViewRefresh = currentView.type === 'favorites' || currentView.type === 'tag';

  // Reset selected index when articles change
  useEffect(() => {
    // Remove highlight from any previously selected article
    document.querySelectorAll('.keyboard-selected').forEach(el => {
      el.classList.remove('keyboard-selected');
    });
    setSelectedArticleIndex(-1);
  }, [articlesToShow]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        selectedArticle // Don't interfere with article modal shortcuts
      ) {
        // Allow ? to work even in article modal
        if (e.key === '?' && selectedArticle) {
          e.preventDefault();
          setIsKeyboardShortcutsOpen(prev => !prev);
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case '?':
          e.preventDefault();
          setIsKeyboardShortcutsOpen(prev => !prev);
          break;

        case 'enter':
          // Open selected article
          e.preventDefault();
          if (selectedArticleIndex >= 0 && articlesToShow[selectedArticleIndex]) {
            handleOpenArticle(articlesToShow[selectedArticleIndex]);
          }
          break;

        case 'arrowleft':
        case 'arrowup':
          // Previous article (highlight only)
          e.preventDefault();
          if (contentView === 'articles' && articlesToShow.length > 0) {
            setSelectedArticleIndex(prev => {
              // Remove highlight from previous selection
              if (prev >= 0 && articlesToShow[prev]) {
                const prevElement = document.querySelector(
                  `[data-article-id="${articlesToShow[prev].id}"]`
                );
                prevElement?.classList.remove('keyboard-selected');
              }

              // If nothing selected yet, start at 0, otherwise go to previous
              const prevIndex = prev === -1 ? 0 : Math.max(prev - 1, 0);

              // Add highlight and scroll to the selected article
              setTimeout(() => {
                const articleElement = document.querySelector(
                  `[data-article-id="${articlesToShow[prevIndex]?.id}"]`
                );
                articleElement?.classList.add('keyboard-selected');
                articleElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 0);
              return prevIndex;
            });
          }
          break;

        case 'arrowright':
        case 'arrowdown':
          // Next article (highlight only)
          e.preventDefault();
          if (contentView === 'articles' && articlesToShow.length > 0) {
            setSelectedArticleIndex(prev => {
              // Remove highlight from previous selection
              if (prev >= 0 && articlesToShow[prev]) {
                const prevElement = document.querySelector(
                  `[data-article-id="${articlesToShow[prev].id}"]`
                );
                prevElement?.classList.remove('keyboard-selected');
              }

              // If nothing selected yet, start at 0, otherwise go to next
              const nextIndex = prev === -1 ? 0 : Math.min(prev + 1, articlesToShow.length - 1);

              // Add highlight and scroll to the selected article
              setTimeout(() => {
                const articleElement = document.querySelector(
                  `[data-article-id="${articlesToShow[nextIndex]?.id}"]`
                );
                articleElement?.classList.add('keyboard-selected');
                articleElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 0);
              return nextIndex;
            });
          }
          break;

        case 'r':
          // Refresh current view/feed
          e.preventDefault();
          if (currentFeed) {
            handleRefreshSingleFeed(currentFeed.id);
          } else if (shouldShowViewRefresh) {
            handleRefreshCurrentView();
          }
          break;

        case 's':
          // Star/favorite
          e.preventDefault();
          if (currentFeed) {
            handleToggleFavorite(currentFeed.id);
          }
          break;

        case 'l':
          // Add to read later (first visible article)
          e.preventDefault();
          if (articlesToShow.length > 0 && articlesToShow[0]) {
            handleToggleReadLater(articlesToShow[0].id);
          }
          break;

        case '/':
          // Focus search
          e.preventDefault();
          handleSearch('');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    selectedArticle,
    contentView,
    articlesToShow,
    selectedArticleIndex,
    currentFeed,
    shouldShowViewRefresh,
    handleOpenArticle,
    handleRefreshSingleFeed,
    handleRefreshCurrentView,
    handleToggleFavorite,
    handleToggleReadLater,
    handleSearch,
  ]);

  const viewsWithTagFilter = ['favorites', 'published-today', 'readLater', 'history'];
  const shouldShowTagFilter =
    viewsWithTagFilter.includes(currentView.type) && availableTagsForFilter.length > 0;

  const isReorderable = ['feed', 'tag', 'readLater', 'favorites'].includes(currentView.type);
  const handleReorder = (sourceId: string, targetId: string | null) => {
    handleReorderArticles(currentView, sourceId, targetId);
  };

  const areAllVisibleSelected =
    articlesToShow.length > 0 && articlesToShow.every(a => selectedArticleIdsForBatch.has(a.id));

  if (!hasEnteredApp) {
    return <Homepage />;
  }

  return (
    <div
      className={`flex h-screen bg-gray-900 text-gray-200 font-sans ${isMobileView ? 'pb-16' : ''}`}
    >
      {isResolvingArticleUrl && <ResolvingUrlLoader />}
      {isRefreshingAll && refreshProgress !== null && <ProgressBar progress={refreshProgress} />}
      {isGeneratingSummaries && summaryGenerationProgress !== null && (
        <ProgressBar progress={summaryGenerationProgress} />
      )}
      {isMobileView && !isSidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/60 z-20"
          onClick={onToggleSidebar}
          aria-hidden="true"
        />
      )}
      <ErrorBoundary
        fallback={<ErrorFallback error={new Error('Sidebar error')} componentName="Sidebar" />}
      >
        <Sidebar
          onOpenMindmap={() => setIsMindmapModalOpen(true)}
          isMindmapOpen={isMindmapModalOpen}
          onCloseMindmap={() => setIsMindmapModalOpen(false)}
        />
      </ErrorBoundary>
      <ErrorBoundary
        fallback={
          <ErrorFallback error={new Error('Main content error')} componentName="Main Content" />
        }
      >
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="flex-shrink-0 bg-gray-800/80 backdrop-blur-sm border-b border-gray-700 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                {selectedArticleIdsForBatch.size > 0 && contentView === 'articles' ? (
                  <>
                    <span className="text-xl font-bold text-gray-100">
                      {selectedArticleIdsForBatch.size} items selected
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleMarkSelectedAsRead}
                        className="p-2 rounded-full text-white bg-sky-600 hover:bg-sky-500 transition-colors"
                        title="Mark as Read"
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setIsBulkEditArticleTagsModalOpen(true)}
                        className="p-2 rounded-full text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                        title="Tag Selected"
                      >
                        <TagIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleGenerateDigest}
                        className="p-2 rounded-full text-white bg-purple-600 hover:bg-purple-500 transition-colors"
                        title="Create AI Digest from selected articles"
                      >
                        <SparklesIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleGenerateSummariesForSelected}
                        disabled={isGeneratingSummaries}
                        className="p-2 rounded-full text-white bg-cyan-600 hover:bg-cyan-500 transition-colors disabled:bg-cyan-400/50 disabled:cursor-not-allowed"
                        title={
                          isGeneratingSummaries
                            ? 'Generating summaries...'
                            : 'Generate AI summaries for selected articles'
                        }
                      >
                        {isGeneratingSummaries ? (
                          <RefreshIcon className="w-5 h-5 animate-spin" />
                        ) : (
                          <AiSummaryIcon className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={handleGenerateEbook}
                        disabled={isGeneratingEbook}
                        className="p-2 rounded-full text-white bg-green-600 hover:bg-green-500 transition-colors disabled:bg-green-400/50 disabled:cursor-not-allowed"
                        title={
                          isGeneratingEbook
                            ? 'Generating EPUB...'
                            : 'Create EPUB from selected articles'
                        }
                      >
                        {isGeneratingEbook ? (
                          <RefreshIcon className="w-5 h-5 animate-spin" />
                        ) : (
                          <BookOpenIcon className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={handleSaveSelectionAsNote}
                        disabled={isSavingSelectionAsNote}
                        className="p-2 rounded-full text-white bg-teal-600 hover:bg-teal-500 transition-colors disabled:bg-teal-400/50 disabled:cursor-not-allowed"
                        title={
                          isSavingSelectionAsNote ? 'Saving...' : 'Save selected articles as a note'
                        }
                      >
                        {isSavingSelectionAsNote ? (
                          <RefreshIcon className="w-5 h-5 animate-spin" />
                        ) : (
                          <SaveIcon className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={handleBulkDeleteArticles}
                        className="p-2 rounded-full text-white bg-red-600 hover:bg-red-500 transition-colors"
                        title="Delete Selected"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleClearArticleSelection}
                        className="p-2 rounded-full text-white bg-gray-600 hover:bg-gray-500 transition-colors"
                        title="Unselect All"
                      >
                        <XIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h1 className="text-xl font-bold text-gray-100 truncate" title={headerTitle}>
                      {headerTitle}
                    </h1>
                    {contentView === 'articles' && articlesToShow.length > 0 && (
                      <button
                        onClick={handleSelectAllArticles}
                        className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                        title={
                          areAllVisibleSelected
                            ? 'Deselect all visible articles'
                            : 'Select all visible articles'
                        }
                      >
                        {areAllVisibleSelected ? (
                          <XSquareIcon className="w-5 h-5" />
                        ) : (
                          <CheckSquareIcon className="w-5 h-5" />
                        )}
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
                          <RefreshIcon
                            className={`w-5 h-5 ${isCurrentFeedRefreshing ? 'animate-spin' : ''}`}
                          />
                        </button>
                        <button
                          onClick={() => handleToggleFavorite(currentFeed.id)}
                          className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                          title={currentFeed.isFavorite ? 'Unfavorite' : 'Favorite'}
                        >
                          <StarIcon
                            className={`w-5 h-5 ${currentFeed.isFavorite ? 'text-yellow-400 fill-current' : ''}`}
                          />
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
                          onClick={() =>
                            handleOpenBulkEditForTag(
                              typeof currentView.value === 'object'
                                ? currentView.value.name
                                : currentView.value
                            )
                          }
                          className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                          title={`Add feeds to tag #${typeof currentView.value === 'object' ? currentView.value.name : currentView.value}`}
                        >
                          <PlusIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            const oldName =
                              typeof currentView.value === 'object'
                                ? currentView.value.name
                                : currentView.value;
                            const newName = prompt(
                              `Enter a new name for the tag "#${oldName}":`,
                              oldName
                            );
                            if (
                              newName &&
                              newName.trim() &&
                              newName.trim().toUpperCase() !== oldName.toUpperCase()
                            ) {
                              handleRenameTag(oldName, newName.trim());
                            }
                          }}
                          className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                          title={`Rename tag #${typeof currentView.value === 'object' ? currentView.value.name : currentView.value}`}
                        >
                          <PencilIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() =>
                            handleDeleteTag(
                              typeof currentView.value === 'object'
                                ? currentView.value.name
                                : currentView.value
                            )
                          }
                          className="p-2 rounded-full text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                          title={`Delete tag #${typeof currentView.value === 'object' ? currentView.value.name : currentView.value}`}
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
                        <RefreshIcon
                          className={`w-5 h-5 ${isRefreshingAll ? 'animate-spin' : ''}`}
                        />
                      </button>
                    )}
                    {contentView === 'articles' && articlesToShow.length > 0 && (
                      <>
                        <button
                          onClick={handleGenerateSummariesForView}
                          disabled={isGeneratingSummaries}
                          className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            isGeneratingSummaries
                              ? 'Generating summaries...'
                              : 'Generate AI summaries for all eligible videos in this view'
                          }
                        >
                          {isGeneratingSummaries ? (
                            <RefreshIcon className="w-5 h-5 animate-spin" />
                          ) : (
                            <AiSummaryIcon className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={handleSaveViewAsNote}
                          disabled={isSavingViewAsNote}
                          className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Save all articles in this view as a note"
                        >
                          {isSavingViewAsNote ? (
                            <RefreshIcon className="w-5 h-5 animate-spin" />
                          ) : (
                            <SaveIcon className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={handleGenerateEbookFromView}
                          disabled={isGeneratingEbookFromView}
                          className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            isGeneratingEbookFromView
                              ? 'Generating EPUB...'
                              : 'Create EPUB from this view'
                          }
                        >
                          {isGeneratingEbookFromView ? (
                            <RefreshIcon className="w-5 h-5 animate-spin" />
                          ) : (
                            <BookOpenIcon className="w-5 h-5" />
                          )}
                        </button>
                      </>
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
                  </>
                )}
              </div>
              {selectedArticleIdsForBatch.size === 0 &&
                currentFeed &&
                currentFeed.tags &&
                currentFeed.tags.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {currentFeed.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs font-medium bg-gray-700 text-gray-300 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              {selectedArticleIdsForBatch.size === 0 && currentFeed && currentFeed.description && (
                <p
                  className="mt-2 text-sm text-gray-400 line-clamp-2"
                  title={currentFeed.description}
                >
                  {currentFeed.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              {contentView === 'feedsGrid' && (
                <>
                  <button
                    onClick={handleZoomIn}
                    disabled={!canZoomIn}
                    className="p-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Zoom In"
                  >
                    <ZoomInIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleZoomOut}
                    disabled={!canZoomOut}
                    className="p-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Zoom Out"
                  >
                    <ZoomOutIcon className="w-5 h-5" />
                  </button>
                </>
              )}
              {contentView === 'articles' && currentView.type !== 'search' && (
                <>
                  <div className="flex items-center gap-1 bg-gray-900/50 p-1 rounded-lg">
                    <button
                      onClick={() => setArticleViewMode('grid')}
                      className={`p-1.5 rounded-md transition-colors ${articleViewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                      title="Grid View"
                    >
                      <GridViewIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setArticleViewMode('list')}
                      className={`p-1.5 rounded-md transition-colors ${articleViewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                      title="List View"
                    >
                      <ListIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setArticleViewMode('reader')}
                      className={`p-1.5 rounded-md transition-colors ${articleViewMode === 'reader' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                      title="Reader View"
                    >
                      <FileTextIcon className="w-5 h-5" />
                    </button>
                  </div>
                  {articleViewMode === 'grid' && (
                    <>
                      <button
                        onClick={handleArticleZoomIn}
                        disabled={!canArticleZoomIn}
                        className="p-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Zoom In"
                      >
                        <ZoomInIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleArticleZoomOut}
                        disabled={!canArticleZoomOut}
                        className="p-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Zoom Out"
                      >
                        <ZoomOutIcon className="w-5 h-5" />
                      </button>
                    </>
                  )}
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
              feeds={feedsForGrid}
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
          ) : contentView === 'help' ? (
            <HelpContent />
          ) : contentView === 'notes' ? (
            <NotesContent />
          ) : contentView === 'articles' && articleViewMode === 'reader' ? (
            <ArticleReaderView
              articles={articlesToShow}
              handleOpenArticle={handleOpenArticle}
              selectedArticleIds={selectedArticleIdsForBatch}
              onToggleArticleSelection={handleToggleArticleSelection}
              readLaterArticleIds={readLaterArticleIds}
              onToggleReadLater={handleToggleReadLater}
            />
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
              articleViewMode={articleViewMode as 'grid' | 'list'}
              selectedArticleIds={selectedArticleIdsForBatch}
              onToggleArticleSelection={handleToggleArticleSelection}
              isReorderable={isReorderable}
              onReorder={handleReorder}
            />
          )}
        </main>
      </ErrorBoundary>

      <ErrorBoundary>
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
        <SyncDataModal />
        <ActionsMenuModal onOpenMindmap={() => setIsMindmapModalOpen(true)} />
        <NoteEditorModal />
        <TrendingKeywordsModal />
        <EpubSettingsModal />
        <RefreshOptionsModal />
      </ErrorBoundary>

      {selectedArticle && <ArticleModal />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {isDemoMode && <DemoGuide />}
      {isMobileView && <BottomNavBar />}
      {isMindmapModalOpen && (
        <MindmapModal
          isOpen={true}
          onClose={() => setIsMindmapModalOpen(false)}
          articles={allArticles}
          onOpenArticle={handleOpenArticle}
        />
      )}
      <KeyboardShortcutsModal
        isOpen={isKeyboardShortcutsOpen}
        onClose={() => setIsKeyboardShortcutsOpen(false)}
      />
    </div>
  );
};

export default App;
