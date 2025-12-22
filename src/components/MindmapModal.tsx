import React, { useState } from 'react';
import { XIcon, SearchIcon } from './icons';
import type { Article, MindmapHierarchy } from '../types';
import { generateMindmapHierarchy } from '../services/geminiService';
import { useAppContext } from '../contexts/AppContext';

interface MindmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: Article[];
  onOpenArticle: (article: Article) => void;
}

// Outline View Component
const OutlineView: React.FC<{
  hierarchy: MindmapHierarchy;
  articles: Article[];
  expandedTopics: Set<string>;
  onToggleTopic: (topicId: string) => void;
  onOpenArticle: (article: Article) => void;
  searchQuery: string;
  viewMode: 'list' | 'thumbnail';
}> = ({
  hierarchy,
  articles,
  expandedTopics,
  onToggleTopic,
  onOpenArticle,
  searchQuery,
  viewMode,
}) => {
  const articleMap = new Map(articles.map(a => [a.id, a]));
  const query = searchQuery.toLowerCase();

  const matchesSearch = (text: string) => {
    return !query || text.toLowerCase().includes(query);
  };

  const renderArticle = (article: Article) => {
    if (viewMode === 'thumbnail') {
      return (
        <button
          key={article.id}
          onClick={() => onOpenArticle(article)}
          className="group relative overflow-hidden rounded-lg bg-gray-800 hover:bg-gray-750 transition-all"
        >
          <div className="aspect-video w-full overflow-hidden bg-gray-900">
            {article.imageUrl ? (
              <img
                src={article.imageUrl}
                alt={article.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600">
                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                  <span className="text-2xl">📄</span>
                </div>
              </div>
            )}
          </div>
          <div className="p-2">
            <div className="text-xs text-gray-300 group-hover:text-white line-clamp-2">
              {article.title}
            </div>
          </div>
        </button>
      );
    } else {
      return (
        <button
          key={article.id}
          onClick={() => onOpenArticle(article)}
          className="w-full text-left p-3 pl-12 hover:bg-gray-800 transition-colors border-t border-gray-800 group"
        >
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0"></div>
            <div className="text-sm text-gray-300 group-hover:text-white line-clamp-2">
              {article.title}
            </div>
          </div>
        </button>
      );
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-6 space-y-4">
      {hierarchy.rootTopics.map((rootTopic, rootIndex) => {
        const rootId = `root-${rootIndex}`;
        const isRootExpanded = expandedTopics.has(rootId);
        const rootArticleCount = (rootTopic.subTopics || []).reduce(
          (sum, sub) => sum + (sub.articleIds?.length || 0),
          rootTopic.articleIds?.length || 0
        );

        // Filter visibility based on search
        const rootMatches = matchesSearch(rootTopic.title);
        const hasMatchingContent =
          rootMatches ||
          (rootTopic.subTopics || []).some(
            sub =>
              matchesSearch(sub.title) ||
              (sub.articleIds || []).some(id => {
                const article = articleMap.get(id);
                return article && matchesSearch(article.title);
              })
          );

        if (!hasMatchingContent) return null;

        return (
          <div key={rootId} className="border border-gray-700 rounded-lg overflow-hidden">
            {/* Root Topic Header */}
            <button
              onClick={() => onToggleTopic(rootId)}
              className="w-full flex items-center justify-between p-4 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
              style={{ opacity: rootMatches ? 1 : 0.5 }}
            >
              <div className="flex items-center gap-3">
                <div className="text-lg font-semibold text-white">{rootTopic.title}</div>
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-full">
                  {rootArticleCount} {rootArticleCount === 1 ? 'article' : 'articles'}
                </span>
              </div>
              <div
                className={`text-gray-400 transition-transform ${isRootExpanded ? 'rotate-90' : ''}`}
              >
                ▶
              </div>
            </button>

            {/* Sub-topics and Articles */}
            {isRootExpanded && (
              <div className="bg-gray-850">
                {(rootTopic.subTopics || []).length > 0 ? (
                  (rootTopic.subTopics || []).map((subTopic, subIndex) => {
                    const subId = `${rootId}-sub-${subIndex}`;
                    const isSubExpanded = expandedTopics.has(subId);
                    const subMatches = matchesSearch(subTopic.title);
                    const hasMatchingArticles = subTopic.articleIds.some(id => {
                      const article = articleMap.get(id);
                      return article && matchesSearch(article.title);
                    });

                    if (!subMatches && !hasMatchingArticles) return null;

                    return (
                      <div key={subId} className="border-t border-gray-700">
                        {/* Sub-topic Header */}
                        <button
                          onClick={() => onToggleTopic(subId)}
                          className="w-full flex items-center justify-between p-3 pl-8 hover:bg-gray-800 transition-colors text-left"
                          style={{ opacity: subMatches ? 1 : 0.5 }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-gray-200">
                              {subTopic.title}
                            </div>
                            <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">
                              {subTopic.articleIds.length}
                            </span>
                          </div>
                          <div
                            className={`text-gray-500 text-sm transition-transform ${isSubExpanded ? 'rotate-90' : ''}`}
                          >
                            ▶
                          </div>
                        </button>

                        {/* Articles */}
                        {isSubExpanded && (
                          <div
                            className={
                              viewMode === 'thumbnail'
                                ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 bg-gray-900'
                                : 'bg-gray-900'
                            }
                          >
                            {Array.from(new Set(subTopic.articleIds)).map(articleId => {
                              const article = articleMap.get(articleId);
                              if (!article) return null;

                              const articleMatches = matchesSearch(article.title);
                              if (!articleMatches) return null;

                              return renderArticle(article);
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  // Direct articles under root (no sub-topics)
                  <div
                    className={
                      viewMode === 'thumbnail'
                        ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 bg-gray-900'
                        : 'bg-gray-900'
                    }
                  >
                    {Array.from(new Set(rootTopic.articleIds || [])).map(articleId => {
                      const article = articleMap.get(articleId);
                      if (!article) return null;

                      const articleMatches = matchesSearch(article.title);
                      if (!articleMatches) return null;

                      return renderArticle(article);
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const MindmapModal: React.FC<MindmapModalProps> = ({
  isOpen,
  onClose,
  articles,
  onOpenArticle,
}) => {
  const {
    aiModel,
    defaultAiLanguage,
    ytAiHierarchy,
    setYtAiHierarchy,
    nonYtAiHierarchy,
    setNonYtAiHierarchy,
    personalInterests,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<'yt' | 'web'>('yt');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [articleViewMode, setArticleViewMode] = useState<'list' | 'thumbnail'>('list');

  const [isClustering, setIsClustering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentHierarchy = React.useMemo(() => {
    const rawHierarchy = activeTab === 'yt' ? ytAiHierarchy : nonYtAiHierarchy;
    if (!rawHierarchy) return null;

    // Sort root topics so personal interests are at the top
    const sortedTopics = [...rawHierarchy.rootTopics].sort((a, b) => {
      const aIsInterest = personalInterests.some(pi => pi.toLowerCase() === a.title.toLowerCase());
      const bIsInterest = personalInterests.some(pi => pi.toLowerCase() === b.title.toLowerCase());
      if (aIsInterest && !bIsInterest) return -1;
      if (!aIsInterest && bIsInterest) return 1;
      return 0;
    });

    return { rootTopics: sortedTopics };
  }, [activeTab, ytAiHierarchy, nonYtAiHierarchy, personalInterests]);

  const handleClusterWithAI = async (tabToCluster?: 'yt' | 'web') => {
    const targetTab = tabToCluster || activeTab;
    setIsClustering(true);
    setError(null);
    try {
      const isVideoType = targetTab === 'yt';
      const articlesToCluster = articles
        .filter(a => a.title && a.id)
        .filter(a =>
          isVideoType
            ? a.feedId.startsWith('yt-') || a.isVideo
            : !a.feedId.startsWith('yt-') && !a.isVideo
        )
        .sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0))
        .slice(0, 400);

      if (articlesToCluster.length === 0) {
        setError(`No ${isVideoType ? 'YouTube' : 'web'} articles found to cluster.`);
        setIsClustering(false);
        return;
      }

      const hierarchy = await generateMindmapHierarchy(
        articlesToCluster,
        aiModel,
        isVideoType ? 'YouTube' : 'Web Articles',
        defaultAiLanguage,
        personalInterests
      );

      if (isVideoType) {
        setYtAiHierarchy(hierarchy);
      } else {
        setNonYtAiHierarchy(hierarchy);
      }
      setExpandedTopics(new Set());
    } catch (error) {
      console.error('[Mindmap] Failed to cluster with AI:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(
        `Failed to cluster with AI: ${errorMessage}. Please check your API key and try again.`
      );
    } finally {
      setIsClustering(false);
    }
  };

  // Auto-execute cluster with AI on first open if active tab not already clustered
  React.useEffect(() => {
    if (isOpen && !currentHierarchy && !isClustering && articles.length > 0) {
      handleClusterWithAI();
    }
  }, [isOpen, currentHierarchy, isClustering, articles, activeTab]);

  const handleExpandAll = () => {
    if (!currentHierarchy) return;

    const allTopicIds: string[] = [];
    currentHierarchy.rootTopics.forEach((rootTopic, rootIndex) => {
      const rootId = `root-${rootIndex}`;
      allTopicIds.push(rootId);
      rootTopic.subTopics.forEach((_, subIndex) => {
        const subId = `${rootId}-sub-${subIndex}`;
        allTopicIds.push(subId);
      });
    });
    setExpandedTopics(new Set(allTopicIds));
  };

  const handleCollapseAll = () => setExpandedTopics(new Set());

  const handleToggleTopic = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/95 backdrop-blur-sm z-50 flex flex-col">
      {/* Header */}
      <div className="relative flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-6">
          <h2 className="text-xl font-bold text-white">AI Grouping</h2>
          <div className="flex bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('yt')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === 'yt'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              YouTube
            </button>
            <button
              onClick={() => setActiveTab('web')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === 'web'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Web Articles
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-800 rounded-full transition-colors z-10"
          aria-label="Close"
        >
          <XIcon className="w-6 h-6 text-gray-400" />
        </button>

        <div className="flex items-center gap-2 md:gap-4 flex-wrap pr-12 md:pr-0">
          <div className="flex gap-2 mr-4 border-l border-gray-700 pl-4">
            <button
              onClick={() => setArticleViewMode('list')}
              className={`px-3 py-1 text-xs font-medium rounded ${
                articleViewMode === 'list'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 bg-gray-800 border border-gray-600 hover:bg-gray-700'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setArticleViewMode('thumbnail')}
              className={`px-3 py-1 text-xs font-medium rounded ${
                articleViewMode === 'thumbnail'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 bg-gray-800 border border-gray-600 hover:bg-gray-700'
              }`}
            >
              Thumbnail
            </button>
          </div>
          <div className="flex gap-2 mr-4">
            <button
              onClick={() => {
                if (activeTab === 'yt') setYtAiHierarchy(null);
                else setNonYtAiHierarchy(null);
                setExpandedTopics(new Set());
              }}
              disabled={isClustering}
              className="px-3 py-1 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Re-cluster articles with AI"
            >
              {isClustering ? 'Clustering...' : 'Refresh'}
            </button>
            <button
              onClick={handleExpandAll}
              className="px-3 py-1 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700"
            >
              Expand All
            </button>
            <button
              onClick={handleCollapseAll}
              className="px-3 py-1 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700"
            >
              Collapse All
            </button>
          </div>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 w-64"
            />
          </div>
        </div>
      </div>

      {/* Outline View */}
      <div className="flex-1 min-h-0 relative">
        {!currentHierarchy ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              {isClustering ? (
                <>
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-300 text-lg font-medium">
                    Organizing {activeTab === 'yt' ? 'YouTube' : 'Web'} articles with AI...
                  </p>
                  <p className="text-gray-500 text-sm mt-2">
                    Creating a smart hierarchy of your content
                  </p>
                </>
              ) : error ? (
                <div className="max-w-md mx-auto p-6 bg-red-900/20 border border-red-700 rounded-lg">
                  <div className="text-red-400 text-lg font-medium mb-2">Clustering Failed</div>
                  <p className="text-gray-300 text-sm">{error}</p>
                  <button
                    onClick={() => handleClusterWithAI()}
                    className="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-md text-sm font-medium transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-gray-400 text-lg">No articles found</p>
                  <p className="text-gray-500 text-sm mt-2">
                    Add some {activeTab === 'yt' ? 'YouTube' : 'web'} content to see it organized
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <OutlineView
            hierarchy={currentHierarchy}
            articles={articles}
            expandedTopics={expandedTopics}
            onToggleTopic={handleToggleTopic}
            onOpenArticle={article => {
              onOpenArticle(article);
              onClose();
            }}
            searchQuery={searchQuery}
            viewMode={articleViewMode}
          />
        )}
      </div>
    </div>
  );
};
