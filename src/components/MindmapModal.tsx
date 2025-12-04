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
import { buildMindmapGraph, buildMindmapFromHierarchy } from '../utils/mindmapUtils';
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
        <div
            className="px-4 py-2 shadow-xl rounded-full bg-gray-700 border border-gray-600 min-w-[120px] flex items-center justify-between cursor-pointer hover:bg-gray-600 hover:border-gray-500 transition-all"
        >
            <Handle type="target" position={Position.Left} className="!bg-gray-500 !w-2 !h-2" />
            <div className="text-sm font-semibold text-white mr-3">{data.label}</div>
            <div className={`
                flex items-center justify-center w-5 h-5 rounded-full 
                ${data.isCollapsed ? 'bg-indigo-500 text-white' : 'bg-gray-600 text-gray-300'}
                text-[10px] font-bold transition-colors
            `}>
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

export const MindmapModal: React.FC<MindmapModalProps> = ({
    isOpen,
    onClose,
    articles,
    onOpenArticle,
}) => {
    const { aiModel } = useAppContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [isInitialized, setIsInitialized] = useState(false);
    const [aiHierarchy, setAiHierarchy] = useState<MindmapHierarchy | null>(null);
    const [isClustering, setIsClustering] = useState(false);

    // Build the graph from articles - recalculate when expand state changes
    const graphWithExpansion = useMemo(() => {
        const videos = articles.filter(a => a.isVideo);
        if (videos.length === 0) return { nodes: [], edges: [] };

        // Use AI hierarchy if available
        if (aiHierarchy) {
            return buildMindmapFromHierarchy(videos, aiHierarchy, expandedTopics);
        }

        return buildMindmapGraph(videos, expandedTopics);
    }, [articles, expandedTopics, aiHierarchy]);

    const handleClusterWithAI = async () => {
        setIsClustering(true);
        try {
            const videos = articles.filter(a => a.isVideo);
            const hierarchy = await generateMindmapHierarchy(videos, aiModel);
            setAiHierarchy(hierarchy);

            // Reset expansion state for new hierarchy
            setExpandedTopics(new Set());
            setIsInitialized(false); // Trigger re-initialization of expansion state
        } catch (error) {
            console.error('Failed to cluster with AI:', error);
            alert('Failed to cluster with AI. Please try again.');
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
    }, [isOpen]); // Only run when modal opens



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
                                    if (n.id !== node.id &&
                                        n.id.startsWith(parentPrefix + '-sub-') &&
                                        (n.data.isSubTopic || n.id.includes('-sub'))) {
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
        const allTopicIds = graphWithExpansion.nodes
            .filter(n => n.type === 'topic')
            .map(n => n.id);
        setExpandedTopics(new Set(allTopicIds));
    };

    // Collapse All: clear all expanded topics (hide all videos)
    const handleCollapseAll = () => setExpandedTopics(new Set());

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
            style: query && !node.data.label.toLowerCase().includes(query)
                ? { opacity: 0.3 }
                : undefined,
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
        <div className="flex flex-col h-full bg-gray-900">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">Video Mindmap</h2>
                <div className="flex items-center gap-4">
                    <div className="flex gap-2 mr-4">
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
                    <button
                        onClick={handleClusterWithAI}
                        disabled={isClustering}
                        className={`
                                px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center
                                ${isClustering
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'}
                            `}
                    >
                        {isClustering ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                Clustering...
                            </>
                        ) : (
                            <>
                                <span className="mr-2">✨</span>
                                Cluster with AI
                            </>
                        )}
                    </button>
                    <div className="relative">
                        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search videos..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
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

            {/* Graph */}
            <div className="flex-1 relative">
                {graphWithExpansion.nodes.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-gray-400 text-lg">No videos with AI summaries found</p>
                            <p className="text-gray-500 text-sm mt-2">
                                Generate AI summaries for your videos to see them in the mindmap
                            </p>
                        </div>
                    </div>
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
                        <Panel position="top-right" className="bg-gray-800/90 rounded-lg p-3 text-xs text-gray-300">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                                    <span>Videos ({visibleNodes.filter(n => n.type === 'video').length})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                    <span>Topics ({visibleNodes.filter(n => n.type === 'topic').length})</span>
                                </div>
                                <div className="text-gray-500 mt-2 italic">
                                    Click topics to expand/collapse
                                </div>
                            </div>
                        </Panel>
                    </ReactFlow>
                )}
            </div>
        </div>
    );
};
