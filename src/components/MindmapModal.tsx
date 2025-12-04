import React, { useMemo, useCallback, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { XIcon, SearchIcon } from './icons';
import type { Article, MindmapHierarchy } from '../types';
import { buildMindmapFromHierarchy } from '../utils/mindmapUtils';
import { generateMindmapHierarchy } from '../services/geminiService';
import { useAppContext } from '../contexts/AppContext';

interface MindmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: Article[];
  onOpenArticle: (article: Article) => void;
}

// Custom node component for videos
const VideoNode = ({ data }: { data: any }) => {
  return (
    <div className="px-4 py-2 shadow-lg rounded-full bg-gray-800 border border-gray-600 min-w-[150px] flex items-center justify-between group hover:border-indigo-500 transition-colors">
      <Handle type="target" position={Position.Left} className="!bg-gray-500 !w-2 !h-2" />
      <div className="text-xs font-medium text-gray-200 truncate mr-2">{data.label}</div>
      <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
    </div>
  );
};

// Custom node component for topics
const TopicNode = ({ data }: { data: any }) => {
  return (
    <div className="px-4 py-2 shadow-xl rounded-full bg-gray-700 border border-gray-600 min-w-[120px] flex items-center justify-between cursor-pointer hover:bg-gray-600 hover:border-gray-500 transition-all">
      <Handle type="target" position={Position.Left} className="!bg-gray-500 !w-2 !h-2" />
      <div className="text-sm font-semibold text-white mr-3">{data.label}</div>
      <div
        className={`
                flex items-center justify-center w-5 h-5 rounded-full 
                ${data.isCollapsed ? 'bg-indigo-500 text-white' : 'bg-gray-600 text-gray-300'}
                text-[10px] font-bold transition-colors
            `}
      >
        {data.isCollapsed ? '+' : '>'}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-indigo-500 !w-2 !h-2" />
    </div>
  );
};

const nodeTypes = {
  video: VideoNode,
  topic: TopicNode,
};

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
        const rootArticleCount = rootTopic.subTopics.reduce(
          (sum, sub) => sum + sub.articleIds.length,
          rootTopic.articleIds.length
        );

        // Filter visibility based on search
        const rootMatches = matchesSearch(rootTopic.title);
        const hasMatchingContent =
          rootMatches ||
          rootTopic.subTopics.some(
            sub =>
              matchesSearch(sub.title) ||
              sub.articleIds.some(id => {
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
                  {rootArticleCount} {rootArticleCount === 1 ? 'video' : 'videos'}
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
                {rootTopic.subTopics.length > 0 ? (
                  rootTopic.subTopics.map((subTopic, subIndex) => {
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
                            {subTopic.articleIds.map(articleId => {
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
                    {rootTopic.articleIds.map(articleId => {
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
  const { aiModel } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'graph' | 'outline'>('graph');
  const [articleViewMode, setArticleViewMode] = useState<'list' | 'thumbnail'>('list');
  const [isInitialized, setIsInitialized] = useState(false);
  const [aiHierarchy, setAiHierarchy] = useState<MindmapHierarchy | null>(() => {
    // Load from localStorage on mount
    const stored = localStorage.getItem('mindmap_hierarchy');
    return stored ? JSON.parse(stored) : null;
  });
  const [isClustering, setIsClustering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build the graph from AI hierarchy
  const graphWithExpansion = useMemo(() => {
    const videos = articles.filter(a => a.isVideo);
    if (videos.length === 0 || !aiHierarchy) return { nodes: [], edges: [] };

    return buildMindmapFromHierarchy(videos, aiHierarchy, expandedTopics);
  }, [articles, expandedTopics, aiHierarchy]);

  const handleClusterWithAI = async () => {
    setIsClustering(true);
    setError(null);
    try {
      const videos = articles.filter(a => {
        // Check isVideo flag or YouTube URL
        if (a.isVideo) return true;
        if (a.link && (a.link.includes('youtube.com') || a.link.includes('youtu.be'))) return true;
        return false;
      });

      if (videos.length === 0) {
        setError('No videos found to cluster. Please add some YouTube videos first.');
        setIsClustering(false);
        return;
      }

      const hierarchy = await generateMindmapHierarchy(videos, aiModel);
      setAiHierarchy(hierarchy);

      // Persist to localStorage
      localStorage.setItem('mindmap_hierarchy', JSON.stringify(hierarchy));

      // Reset expansion state for new hierarchy
      setExpandedTopics(new Set());
      setIsInitialized(false); // Trigger re-initialization of expansion state
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

  // Initialize: all topics start collapsed (empty set = nothing expanded)
  React.useEffect(() => {
    if (graphWithExpansion.nodes.length > 0 && !isInitialized) {
      // Start with empty set = all collapsed
      setExpandedTopics(new Set());
      setIsInitialized(true);
    }
  }, [graphWithExpansion.nodes, isInitialized]);

  // Auto-execute cluster with AI on first open if not already clustered
  React.useEffect(() => {
    if (isOpen && !aiHierarchy && !isClustering && articles.filter(a => a.isVideo).length > 0) {
      handleClusterWithAI();
    }
  }, [isOpen, aiHierarchy, isClustering, articles]); // Added missing dependencies

  // Handle node click - accordion for main topics, accordion for sub-topics
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'video' && node.data.article) {
        onOpenArticle(node.data.article);
        onClose(); // Close the mindmap modal
      } else if (node.type === 'topic') {
        // Check if this is a sub-topic
        const isSubTopic = node.data.isSubTopic || node.id.includes('-sub');

        if (isSubTopic) {
          // Sub-topics: accordion behavior (only one sub-topic expanded per parent)
          setExpandedTopics(prev => {
            const next = new Set(prev);

            // If clicking a collapsed sub-topic (not in set)
            if (!next.has(node.id)) {
              // 1. Expand the clicked sub-topic
              next.add(node.id);

              // 2. Collapse all sibling sub-topics
              const parentIdMatch = node.id.match(/(.*)-sub-\d+(-\d+)?$/);
              if (parentIdMatch) {
                const parentPrefix = parentIdMatch[1];
                // Find all other sub-topics of the same parent and remove them
                graphWithExpansion.nodes.forEach(n => {
                  if (
                    n.id !== node.id &&
                    n.id.startsWith(parentPrefix + '-sub-') &&
                    (n.data.isSubTopic || n.id.includes('-sub'))
                  ) {
                    next.delete(n.id); // Collapse sibling
                  }
                });
              }
            } else {
              // If clicking an expanded sub-topic, just collapse it
              next.delete(node.id);
            }
            return next;
          });
        } else {
          // Main topics: accordion behavior (only one expanded at a time)
          setExpandedTopics(prev => {
            // If clicking a collapsed topic (not in set), expand it and collapse all others
            if (!prev.has(node.id)) {
              // Expand only this topic
              return new Set([node.id]);
            } else {
              // If clicking an expanded topic, collapse it
              return new Set();
            }
          });
        }
      }
    },
    [onOpenArticle, graphWithExpansion.nodes]
  );

  // Expand All: add all topic IDs to expanded set (show all videos)
  const handleExpandAll = () => {
    if (!aiHierarchy) return;

    const allTopicIds: string[] = [];

    // Traverse the hierarchy to get ALL topic IDs (roots and sub-topics)
    aiHierarchy.rootTopics.forEach((rootTopic, rootIndex) => {
      const rootId = `root-${rootIndex}`;
      allTopicIds.push(rootId);

      // Add all sub-topic IDs
      rootTopic.subTopics.forEach((_, subIndex) => {
        const subId = `${rootId}-sub-${subIndex}`;
        allTopicIds.push(subId);
      });
    });

    setExpandedTopics(new Set(allTopicIds));
  };

  // Collapse All: clear all expanded topics (hide all videos)
  const handleCollapseAll = () => setExpandedTopics(new Set());

  // Toggle topic for outline view
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

  // Apply search filter and add collapse state to node data
  const { visibleNodes, visibleEdges } = useMemo(() => {
    const query = searchQuery.toLowerCase();

    // Apply search filter (opacity) and add collapse state
    const rfNodes: Node[] = graphWithExpansion.nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        ...node.data,
        isCollapsed: !expandedTopics.has(node.id),
      },
      style: query && !node.data.label.toLowerCase().includes(query) ? { opacity: 0.3 } : undefined,
    }));

    const rfEdges: Edge[] = graphWithExpansion.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'default',
      animated: false,
      style: {
        stroke: '#4b5563',
        strokeWidth: 1.5,
      },
    }));

    return { visibleNodes: rfNodes, visibleEdges: rfEdges };
  }, [graphWithExpansion, expandedTopics, searchQuery]);

  // Update nodes/edges when they change
  const [, setNodes, onNodesChange] = useNodesState(visibleNodes);
  const [, setEdges, onEdgesChange] = useEdgesState(visibleEdges);

  // Sync local state with calculated visible nodes/edges
  React.useEffect(() => {
    setNodes(visibleNodes);
    setEdges(visibleEdges);
  }, [visibleNodes, visibleEdges, setNodes, setEdges]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/95 backdrop-blur-sm z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-xl font-bold text-white">AI Grouping</h2>
        <div className="flex items-center gap-4">
          <div className="flex gap-2 mr-4">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-3 py-1 text-xs font-medium rounded ${
                viewMode === 'graph'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 bg-gray-800 border border-gray-600 hover:bg-gray-700'
              }`}
            >
              Graph
            </button>
            <button
              onClick={() => setViewMode('outline')}
              className={`px-3 py-1 text-xs font-medium rounded ${
                viewMode === 'outline'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 bg-gray-800 border border-gray-600 hover:bg-gray-700'
              }`}
            >
              Outline
            </button>
          </div>
          {viewMode === 'outline' && (
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
          )}
          <div className="flex gap-2 mr-4">
            <button
              onClick={() => {
                localStorage.removeItem('mindmap_hierarchy');
                setAiHierarchy(null);
                setExpandedTopics(new Set());
                setIsInitialized(false);
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
              placeholder="Search videos..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 w-64"
            />
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded-full transition-colors"
          >
            <XIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Graph or Outline View */}
      <div className="flex-1 min-h-0 relative">
        {graphWithExpansion.nodes.length === 0 || !aiHierarchy ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              {isClustering ? (
                <>
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-300 text-lg font-medium">Organizing videos with AI...</p>
                  <p className="text-gray-500 text-sm mt-2">
                    Creating a smart hierarchy of your content
                  </p>
                </>
              ) : error ? (
                <div className="max-w-md mx-auto p-6 bg-red-900/20 border border-red-700 rounded-lg">
                  <div className="text-red-400 text-lg font-medium mb-2">Clustering Failed</div>
                  <p className="text-gray-300 text-sm">{error}</p>
                  <button
                    onClick={handleClusterWithAI}
                    className="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-md text-sm font-medium transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-gray-400 text-lg">No videos found</p>
                  <p className="text-gray-500 text-sm mt-2">
                    Add some videos to see them organized in the mindmap
                  </p>
                </>
              )}
            </div>
          </div>
        ) : viewMode === 'outline' ? (
          <OutlineView
            hierarchy={aiHierarchy}
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
        ) : (
          <ReactFlow
            nodes={visibleNodes}
            edges={visibleEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background color="#374151" gap={16} />
            <Controls className="bg-gray-800 border-gray-700" />
            <MiniMap
              className="bg-gray-800 border-gray-700"
              nodeColor={node => {
                if (node.type === 'topic') return node.data.color || '#6366f1';
                return '#4f46e5';
              }}
            />
            <Panel
              position="top-right"
              className="bg-gray-800/90 rounded-lg p-3 text-xs text-gray-300"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                  <span>Videos ({visibleNodes.filter(n => n.type === 'video').length})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span>Topics ({visibleNodes.filter(n => n.type === 'topic').length})</span>
                </div>
                <div className="text-gray-500 mt-2 italic">Click topics to expand/collapse</div>
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>
    </div>
  );
};
