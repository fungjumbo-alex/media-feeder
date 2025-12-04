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

    // Create a new directed graph for layout
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 30 });
    g.setDefaultEdgeLabel(() => ({}));

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
        nodes.push(rootNode);
        g.setNode(rootId, { width: 250, height: 60 });

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
                nodes.push(subNode);
                g.setNode(subId, { width: 220, height: 50 });

                // Edge: Root -> Sub
                edges.push({
                    id: `${rootId}-${subId}`,
                    source: rootId,
                    target: subId,
                    type: 'topic',
                });
                g.setEdge(rootId, subId);

                // Process Articles in Sub-topic - only if sub-topic IS expanded
                if (expandedTopics.has(subId)) {
                    subTopic.articleIds.forEach(articleId => {
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
                            nodes.push(articleNode);
                            g.setNode(articleId, { width: 350, height: 50 });

                            // Edge: Sub -> Article
                            edges.push({
                                id: `${subId}-${articleId}`,
                                source: subId,
                                target: articleId,
                                type: 'topic',
                            });
                            g.setEdge(subId, articleId);
                        }
                    });
                }
            }
        });

        // Process Direct Articles under Root - only if root IS expanded AND has no sub-topics
        // If a root topic has sub-topics, we only show sub-topics when expanded
        // If a root topic has NO sub-topics, we show direct articles when expanded
        if (expandedTopics.has(rootId) && rootTopic.subTopics.length === 0) {
            rootTopic.articleIds.forEach(articleId => {
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
                    nodes.push(articleNode);
                    g.setNode(articleId, { width: 350, height: 50 });

                    // Edge: Root -> Article
                    edges.push({
                        id: `${rootId}-${articleId}`,
                        source: rootId,
                        target: articleId,
                        type: 'topic',
                    });
                    g.setEdge(rootId, articleId);
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
