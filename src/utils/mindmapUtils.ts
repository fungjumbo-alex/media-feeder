import type { Article, MindmapGraph, MindmapNode, MindmapEdge, MindmapHierarchy } from '../types';

/**
 * Extract topics/keywords from an article (from AI summary, title, description, or tags)
 */
export function extractTopicsFromArticle(article: Article): string[] {
    const topics = new Set<string>();

    // Extract from structured summary sections (if available)
    if (article.structuredSummary?.sections) {
        article.structuredSummary.sections.forEach(section => {
            // Extract keywords from section titles
            const words = section.title
                .toLowerCase()
                .split(/\s+/)
                .filter(word => word.length > 3);
            words.forEach(word => topics.add(word));
        });
    }

    // Extract from overall summary (if available)
    if (article.structuredSummary?.overallSummary) {
        const summary = article.structuredSummary.overallSummary.toLowerCase();
        const keywords = summary.match(/\b[a-z]{4,}\b/g) || [];
        keywords.slice(0, 10).forEach(keyword => topics.add(keyword));
    }

    // Extract from article tags (always available)
    if (article.tags) {
        article.tags.forEach(tag => topics.add(tag.toLowerCase()));
    }

    // Extract from title if no other topics found
    if (topics.size === 0 && article.title) {
        const titleWords = article.title
            .toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3 && !['with', 'from', 'this', 'that', 'have', 'been', 'will'].includes(word));
        titleWords.slice(0, 5).forEach(word => topics.add(word));
    }

    // Extract from description as fallback
    if (topics.size === 0 && article.description) {
        const descWords = article.description
            .toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3 && !['with', 'from', 'this', 'that', 'have', 'been', 'will'].includes(word));
        descWords.slice(0, 5).forEach(word => topics.add(word));
    }

    return Array.from(topics).slice(0, 15); // Limit to top 15 topics
}

/**
 * Calculate similarity between two articles based on shared topics
 */
export function calculateSimilarity(
    topics1: string[],
    topics2: string[]
): number {
    const set1 = new Set(topics1);
    const set2 = new Set(topics2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Build a mindmap graph from articles
 */
import dagre from 'dagre';

/**
 * Build a mindmap graph from articles using dagre for layout
 */
export function buildMindmapGraph(articles: Article[], expandedTopics: Set<string> = new Set()): MindmapGraph {
    const nodes: MindmapNode[] = [];
    const edges: MindmapEdge[] = [];
    const topicMap = new Map<string, Article[]>();

    // Extract topics for each article
    const articleTopics = new Map<string, string[]>();
    articles.forEach(article => {
        const topics = extractTopicsFromArticle(article);
        articleTopics.set(article.id, topics);

        // Group articles by topic
        topics.forEach(topic => {
            if (!topicMap.has(topic)) {
                topicMap.set(topic, []);
            }
            topicMap.get(topic)!.push(article);
        });
    });

    // Filter topics that appear in multiple articles
    const significantTopics = Array.from(topicMap.entries())
        .filter(([_, arts]) => arts.length >= 2)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 20); // Top 20 topics

    // Create a new directed graph for layout
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 30 });
    g.setDefaultEdgeLabel(() => ({}));

    // Create topic nodes
    const topicNodes = new Map<string, MindmapNode>();
    significantTopics.forEach(([topic, arts], index) => {
        const nodeId = `topic-${topic}`;
        const node: MindmapNode = {
            id: nodeId,
            type: 'topic',
            data: {
                label: topic,
                topic,
                articles: arts,
                color: getTopicColor(index),
                isCollapsed: !expandedTopics.has(nodeId),
            },
            position: { x: 0, y: 0 }, // Will be set by dagre
        };
        topicNodes.set(topic, node);
    });

    // Create video nodes and edges with sub-topic grouping
    const addedVideoIds = new Set<string>();
    const usedTopicIds = new Set<string>();

    // Group articles by their primary topic
    const topicArticlesMap = new Map<string, Article[]>();
    articles.forEach(article => {
        const topics = articleTopics.get(article.id) || [];
        const primaryTopic = topics.find(t => topicNodes.has(t));
        if (primaryTopic) {
            if (!topicArticlesMap.has(primaryTopic)) {
                topicArticlesMap.set(primaryTopic, []);
            }
            topicArticlesMap.get(primaryTopic)!.push(article);
        }
    });

    // Process each topic and create sub-topics if needed
    topicArticlesMap.forEach((topicArticles, topic) => {
        const topicNodeId = `topic-${topic}`;
        usedTopicIds.add(topicNodeId);

        // If topic has <= 5 articles, add them directly
        if (topicArticles.length <= 5) {
            topicArticles.forEach(article => {
                if (expandedTopics.has(topicNodeId) && !addedVideoIds.has(article.id)) {
                    const node: MindmapNode = {
                        id: article.id,
                        type: 'video',
                        data: {
                            label: article.title,
                            article,
                        },
                        position: { x: 0, y: 0 },
                    };
                    nodes.push(node);
                    g.setNode(article.id, { width: 220, height: 40 });
                    addedVideoIds.add(article.id);

                    const edgeId = `${topicNodeId}-${article.id}`;
                    edges.push({
                        id: edgeId,
                        source: topicNodeId,
                        target: article.id,
                        type: 'topic',
                    });
                    g.setEdge(topicNodeId, article.id);
                }
            });
        } else {
            // Cluster articles by secondary keywords
            const subGroups = new Map<string, Article[]>();
            const remainingArticles = [...topicArticles];
            const assignedArticleIds = new Set<string>();

            // 1. Count keyword frequencies in this group
            const keywordCounts = new Map<string, number>();
            remainingArticles.forEach(a => {
                const keywords = articleTopics.get(a.id) || [];
                keywords.forEach(k => {
                    if (k.toLowerCase() !== topic.toLowerCase()) {
                        keywordCounts.set(k, (keywordCounts.get(k) || 0) + 1);
                    }
                });
            });

            // 2. Sort keywords by frequency
            const sortedKeywords = Array.from(keywordCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .filter(entry => entry[1] >= 2); // Only group if at least 2 articles share it

            // 3. Form groups based on top keywords
            sortedKeywords.forEach(([keyword, _]) => {
                const group: Article[] = [];
                remainingArticles.forEach(article => {
                    if (assignedArticleIds.has(article.id)) return;

                    const articleKeywords = articleTopics.get(article.id) || [];
                    if (articleKeywords.includes(keyword)) {
                        group.push(article);
                        assignedArticleIds.add(article.id);
                    }
                });

                if (group.length > 0) {
                    subGroups.set(keyword, group);
                }
            });

            // 4. Collect leftovers
            const leftovers = remainingArticles.filter(a => !assignedArticleIds.has(a.id));
            if (leftovers.length > 0) {
                subGroups.set("Other", leftovers);
            }

            // 5. Create sub-topic nodes
            let subTopicIndex = 0;
            subGroups.forEach((groupArticles, groupName) => {
                // If group is still too large, split it
                const subTopicSize = 5;
                const numChunks = Math.ceil(groupArticles.length / subTopicSize);

                for (let i = 0; i < numChunks; i++) {
                    const chunkArticles = groupArticles.slice(i * subTopicSize, (i + 1) * subTopicSize);
                    const subTopicId = `${topicNodeId}-sub-${subTopicIndex}-${i}`;

                    let label = groupName;
                    if (numChunks > 1) {
                        label = `${groupName} (${i + 1}/${numChunks})`;
                    }

                    // Only create sub-topic if parent topic IS expanded
                    if (expandedTopics.has(topicNodeId)) {
                        // Create sub-topic node
                        const subTopicNode: MindmapNode = {
                            id: subTopicId,
                            type: 'topic',
                            data: {
                                label: label,
                                topic: `${topic}-${groupName}-${i}`,
                                articles: chunkArticles,
                                isSubTopic: true,
                                isCollapsed: !expandedTopics.has(subTopicId),
                            },
                            position: { x: 0, y: 0 },
                        };
                        nodes.push(subTopicNode);
                        g.setNode(subTopicId, { width: 220, height: 50 });

                        // Edge from main topic to sub-topic
                        const topicToSubEdgeId = `${topicNodeId}-${subTopicId}`;
                        edges.push({
                            id: topicToSubEdgeId,
                            source: topicNodeId,
                            target: subTopicId,
                            type: 'topic',
                        });
                        g.setEdge(topicNodeId, subTopicId);

                        // Add articles under sub-topic if sub-topic IS expanded
                        if (expandedTopics.has(subTopicId)) {
                            chunkArticles.forEach(article => {
                                if (!addedVideoIds.has(article.id)) {
                                    const node: MindmapNode = {
                                        id: article.id,
                                        type: 'video',
                                        data: {
                                            label: article.title,
                                            article,
                                        },
                                        position: { x: 0, y: 0 },
                                    };
                                    nodes.push(node);
                                    g.setNode(article.id, { width: 350, height: 50 });
                                    addedVideoIds.add(article.id);

                                    const edgeId = `${subTopicId}-${article.id}`;
                                    edges.push({
                                        id: edgeId,
                                        source: subTopicId,
                                        target: article.id,
                                        type: 'topic',
                                    });
                                    g.setEdge(subTopicId, article.id);
                                }
                            });
                        }
                    }
                }
                subTopicIndex++;
            });
        }
    });

    // Add ONLY used topic nodes to the graph and nodes array
    topicNodes.forEach((node) => {
        if (usedTopicIds.has(node.id)) {
            nodes.push(node);
            g.setNode(node.id, { width: 250, height: 60 });
        }
    });

    // Calculate initial layout to get base positions
    dagre.layout(g);

    // Store original topic Y-positions (for stable ordering)
    const topicYPositions = new Map<string, number>();
    nodes.forEach(node => {
        if (node.type === 'topic') {
            const nodeWithPos = g.node(node.id);
            topicYPositions.set(node.id, nodeWithPos.y);
        }
    });

    // Sort topics by their Y position to maintain order
    const sortedTopics = Array.from(topicYPositions.entries())
        .sort((a, b) => a[1] - b[1]);

    // Reassign Y positions with consistent spacing
    let currentY = 0;
    const topicSpacing = 50; // Vertical spacing between topics

    sortedTopics.forEach(([topicId, _]) => {
        const nodeWithPos = g.node(topicId);
        nodeWithPos.y = currentY;
        currentY += topicSpacing;
    });

    // Update node positions from dagre
    nodes.forEach(node => {
        const nodeWithPos = g.node(node.id);
        node.position = {
            x: nodeWithPos.x - nodeWithPos.width / 2,
            y: nodeWithPos.y - nodeWithPos.height / 2,
        };
    });

    return { nodes, edges };
}

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

        // Process Direct Articles under Root - only if root IS expanded
        // NOTE: We don't show direct articles when root is expanded, only sub-topics
        // This achieves the desired behavior: expanding a main topic shows only sub-topics
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
