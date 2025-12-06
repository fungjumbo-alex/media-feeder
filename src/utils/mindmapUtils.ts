import type { Article, MindmapGraph, MindmapNode, MindmapEdge, MindmapHierarchy } from '../types';

import dagre from 'dagre';

/**
 * Build a mindmap graph from an explicit hierarchy (e.g. from AI)
 */
export function buildMindmapFromHierarchy(
    articles: Article[],
    hierarchy: MindmapHierarchy,
    expandedTopics: Set<string> = new Set()
): MindmapGraph {
    const nodes: MindmapNode[] = [];
    const edges: MindmapEdge[] = [];
    const articleMap = new Map(articles.map(a => [a.id, a]));
    const addedNodeIds = new Set<string>();
    const addedEdgeIds = new Set<string>();

    // Create a new directed graph for layout
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 30 });
    g.setDefaultEdgeLabel(() => ({}));

    // Helper to add node if not exists
    const addNode = (node: MindmapNode, width: number, height: number) => {
        if (!addedNodeIds.has(node.id)) {
            nodes.push(node);
            g.setNode(node.id, { width, height });
            addedNodeIds.add(node.id);
        }
    };

    // Helper to add edge if not exists
    const addEdge = (edge: MindmapEdge) => {
        if (!addedEdgeIds.has(edge.id)) {
            edges.push(edge);
            g.setEdge(edge.source, edge.target);
            addedEdgeIds.add(edge.id);
        }
    };

    // Process Root Topics
    hierarchy.rootTopics.forEach((rootTopic, rootIndex) => {
        const rootId = `root-${rootIndex}`;

        // Create Root Topic Node
        const rootNode: MindmapNode = {
            id: rootId,
            type: 'topic',
            data: {
                label: rootTopic.title,
                topic: rootTopic.title,
                color: getTopicColor(rootIndex),
                isCollapsed: !expandedTopics.has(rootId),
            },
            position: { x: 0, y: 0 },
        };
        addNode(rootNode, 250, 60);

        // Process Sub-topics - only if root IS expanded
        rootTopic.subTopics.forEach((subTopic, subIndex) => {
            const subId = `${rootId}-sub-${subIndex}`;

            // Only create sub-topic if root IS expanded
            if (expandedTopics.has(rootId)) {
                const subNode: MindmapNode = {
                    id: subId,
                    type: 'topic',
                    data: {
                        label: subTopic.title,
                        topic: subTopic.title,
                        isSubTopic: true,
                        isCollapsed: !expandedTopics.has(subId),
                    },
                    position: { x: 0, y: 0 },
                };
                addNode(subNode, 220, 50);

                // Edge: Root -> Sub
                addEdge({
                    id: `${rootId}-${subId}`,
                    source: rootId,
                    target: subId,
                    type: 'topic',
                });

                // Process Articles in Sub-topic - only if sub-topic IS expanded
                if (expandedTopics.has(subId)) {
                    // Use a Set to handle duplicate article IDs within the same subtopic
                    const uniqueArticleIds = new Set(subTopic.articleIds);

                    uniqueArticleIds.forEach(articleId => {
                        const article = articleMap.get(articleId);
                        if (article) {
                            const articleNode: MindmapNode = {
                                id: articleId,
                                type: 'video',
                                data: {
                                    label: article.title,
                                    article,
                                },
                                position: { x: 0, y: 0 },
                            };
                            // Note: We use addNode which handles duplicates across diff topics (graph structure)
                            addNode(articleNode, 350, 50);

                            // Edge: Sub -> Article
                            addEdge({
                                id: `${subId}-${articleId}`,
                                source: subId,
                                target: articleId,
                                type: 'topic',
                            });
                        }
                    });
                }
            }
        });

        // Process Direct Articles under Root - only if root IS expanded AND has no sub-topics
        if (expandedTopics.has(rootId) && rootTopic.subTopics.length === 0) {
            const uniqueArticleIds = new Set(rootTopic.articleIds);

            uniqueArticleIds.forEach(articleId => {
                const article = articleMap.get(articleId);
                if (article) {
                    const articleNode: MindmapNode = {
                        id: articleId,
                        type: 'video',
                        data: {
                            label: article.title,
                            article,
                        },
                        position: { x: 0, y: 0 },
                    };
                    addNode(articleNode, 350, 50);

                    // Edge: Root -> Article
                    addEdge({
                        id: `${rootId}-${articleId}`,
                        source: rootId,
                        target: articleId,
                        type: 'topic',
                    });
                }
            });
        }
    });

    // Calculate layout
    dagre.layout(g);

    // Apply positions
    nodes.forEach(node => {
        const nodeWithPos = g.node(node.id);
        if (nodeWithPos) {
            node.position = {
                x: nodeWithPos.x - nodeWithPos.width / 2,
                y: nodeWithPos.y - nodeWithPos.height / 2,
            };
        }
    });

    return { nodes, edges };
}

/**
 * Get a color for a topic based on its index
 */
function getTopicColor(index: number): string {
    const colors = [
        '#ef4444', // red
        '#f59e0b', // amber
        '#10b981', // emerald
        '#3b82f6', // blue
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#14b8a6', // teal
        '#f97316', // orange
    ];
    return colors[index % colors.length];
}

/**
 * Find article IDs for a given topic title in the hierarchy.
 * @param hierarchy The mindmap hierarchy.
 * @param topicTitle The title of the topic (or subtopic) to search for.
 * @returns An array of article IDs associated with the topic.
 */
export function findArticleIdsForTopic(hierarchy: MindmapHierarchy, topicTitle: string): string[] {
    for (const root of hierarchy.rootTopics) {
        if (root.title === topicTitle) {
            // Aggregate all article IDs from the root and its subtopics
            const allIds = new Set(root.articleIds);
            root.subTopics.forEach(sub => {
                sub.articleIds.forEach(id => allIds.add(id));
            });
            return Array.from(allIds);
        }
        for (const sub of root.subTopics) {
            if (sub.title === topicTitle) {
                return sub.articleIds;
            }
        }
    }
    return [];
}
