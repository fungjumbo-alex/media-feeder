import React, { useState, useRef, useEffect } from 'react';
import type { Article, GridZoomLevel } from '../types';
import { ArticleCard } from './ArticleCard.tsx';
import { ArticleListItem } from './ArticleListItem.tsx';
import { formatRelativeDate, formatTranscriptTime } from '../utils/dateUtils';
import { RssIcon, YouTubeIcon, ExternalLinkIcon, SparklesIcon, BookmarkIcon, ChevronUpIcon, ChevronDownIcon } from './icons';
import { setLinksToOpenInNewTab } from '../utils/textUtils';

export const ArticleReaderView: React.FC<{
    articles: Article[],
    handleOpenArticle: (article: Article) => void,
    selectedArticleIds: Set<string>,
    onToggleArticleSelection: (articleId: string) => void,
    readLaterArticleIds: Set<string>,
    onToggleReadLater: (articleId: string) => void
}> = ({ articles, handleOpenArticle, selectedArticleIds, onToggleArticleSelection, readLaterArticleIds, onToggleReadLater }) => {
    const [currentlyVisibleArticleIndex, setCurrentlyVisibleArticleIndex] = useState(0);
    const articleRefs = useRef<(HTMLElement | null)[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        articleRefs.current = articleRefs.current.slice(0, articles.length);
    }, [articles]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visibleEntries = entries
                    .filter(entry => entry.isIntersecting)
                    .sort((a, b) => {
                        const indexA = parseInt(a.target.getAttribute('data-index') || '0', 10);
                        const indexB = parseInt(b.target.getAttribute('data-index') || '0', 10);
                        return indexA - indexB;
                    });
                
                if (visibleEntries.length > 0) {
                    const topVisibleIndex = parseInt(visibleEntries[0].target.getAttribute('data-index') || '0', 10);
                    setCurrentlyVisibleArticleIndex(topVisibleIndex);
                }
            },
            {
                root: containerRef.current,
                rootMargin: '0px 0px -80% 0px', // Trigger when article enters top 20% of viewport
                threshold: 0
            }
        );

        const currentRefs = articleRefs.current;
        currentRefs.forEach(ref => {
            if (ref) observer.observe(ref);
        });

        return () => {
            currentRefs.forEach(ref => {
                if (ref) observer.unobserve(ref);
            });
        };
    }, [articles]);

    const scrollToArticle = (index: number) => {
        if (articleRefs.current[index]) {
            articleRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const handlePrev = () => {
        if (currentlyVisibleArticleIndex > 0) {
            scrollToArticle(currentlyVisibleArticleIndex - 1);
        } else {
            scrollToArticle(0);
        }
    };

    const handleNext = () => {
        if (currentlyVisibleArticleIndex < articles.length - 1) {
            scrollToArticle(currentlyVisibleArticleIndex + 1);
        }
    };

    if (articles.length === 0) {
        return <div className="text-center text-gray-500 mt-10">No articles to display in reader view.</div>;
    }

    return (
        <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-900">
            <div className="max-w-3xl mx-auto p-4 sm:p-8">
                {articles.map((article, index) => {
                    const isSelected = selectedArticleIds.has(article.id);
                    const isReadLater = readLaterArticleIds.has(article.id);
                    return (
                        <article 
                            key={article.id} 
                            // FIX: Ref callback functions should not return a value.
                            // The original `el => articleRefs.current[index] = el` was implicitly returning `el`.
                            // Adding curly braces `{}` creates a function body and prevents the implicit return.
                            ref={el => { articleRefs.current[index] = el; }}
                            data-index={index}
                            id={`article-reader-${article.id}`}
                            className={`py-8 rounded-lg ${index < articles.length - 1 ? 'border-b border-gray-700' : ''} ${isSelected ? 'bg-indigo-900/20' : ''}`}
                        >
                            <header className="mb-4">
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 pt-2">
                                        <label
                                            className="flex items-center justify-center p-1 cursor-pointer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleArticleSelection(article.id);
                                            }}
                                        >
                                            <div className="relative h-6 w-6">
                                                <input
                                                    type="checkbox"
                                                    readOnly
                                                    checked={isSelected}
                                                    className="appearance-none h-6 w-6 rounded-md border-2 border-gray-600 bg-gray-900 checked:bg-indigo-600 checked:border-indigo-600 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 outline-none cursor-pointer"
                                                    aria-label={`Select article: ${article.title}`}
                                                />
                                                {isSelected && (
                                                    <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 text-white pointer-events-none" viewBox="0 0 16 16" fill="currentColor">
                                                        <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/>
                                                    </svg>
                                                )}
                                            </div>
                                        </label>
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <h1 className="text-3xl font-bold text-white mb-2">{article.title}</h1>
                                        <div className="flex items-center gap-4 text-sm text-gray-400 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                {article.isVideo ? <YouTubeIcon className="w-5 h-5 text-red-500"/> : <RssIcon className="w-5 h-5" />}
                                                <span>{article.feedTitle}</span>
                                            </div>
                                            <span>&middot;</span>
                                            <span>{formatRelativeDate(article.pubDateTimestamp)}</span>
                                            {article.link && (
                                                <>
                                                    <span>&middot;</span>
                                                    <a href={article.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-indigo-300">
                                                        <ExternalLinkIcon className="w-4 h-4" />
                                                        Original Source
                                                    </a>
                                                </>
                                            )}
                                            <>
                                                <span>&middot;</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        onToggleReadLater(article.id);
                                                    }}
                                                    className={`flex items-center gap-1 transition-colors ${isReadLater ? 'text-indigo-400 font-semibold' : 'hover:text-indigo-300'}`}
                                                >
                                                    <BookmarkIcon className={`w-4 h-4 ${isReadLater ? 'fill-current' : ''}`} />
                                                    {isReadLater ? 'Saved' : 'Read Later'}
                                                </button>
                                            </>
                                        </div>
                                    </div>
                                </div>
                            </header>

                            {article.isVideo && article.imageUrl && (
                                <div className="mb-6 group relative cursor-pointer" onClick={() => handleOpenArticle(article)}>
                                    <img src={article.imageUrl} alt={article.title} className="w-full rounded-lg shadow-lg" />
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-black/70 rounded-full p-4">
                                            <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {(article.summary || article.structuredSummary) && (
                                <div className="my-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
                                    <h2 className="text-xl font-bold text-indigo-400 mb-3 flex items-center">
                                        <SparklesIcon className="w-5 h-5 mr-2" />
                                        AI Summary
                                    </h2>
                                    {article.structuredSummary ? (
                                        <div>
                                            <div className="prose prose-invert max-w-none prose-p:my-2 prose-sm">
                                                {article.structuredSummary.overallSummary.split('\n').filter(p => p.trim() !== '').map((p, i) => <p key={i}>{p}</p>)}
                                            </div>
                                            {article.structuredSummary.sections && article.structuredSummary.sections.length > 0 && (
                                                <div className="mt-4 space-y-3">
                                                    <h3 className="font-semibold text-gray-200 mb-2">Key Moments</h3>
                                                    {article.structuredSummary.sections.map((section, secIndex) => (
                                                        <div key={secIndex} className="bg-gray-900/50 p-2 rounded-md">
                                                            <p className="font-semibold text-indigo-400 text-sm">
                                                                <span className="font-mono">{formatTranscriptTime(section.timestamp)}</span> - {section.title}
                                                            </p>
                                                            <p className="text-sm text-gray-400 mt-1">{section.summary}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : article.summary && (
                                        <div className="prose prose-invert max-w-none prose-p:my-2 prose-sm">
                                            {article.summary.split('\n').filter(p => p.trim() !== '').map((p, i) => <p key={i}>{p}</p>)}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div
                                className="prose prose-invert max-w-none prose-p:text-gray-300 prose-headings:text-gray-100 prose-a:text-indigo-400 prose-img:rounded-lg"
                                dangerouslySetInnerHTML={{ __html: setLinksToOpenInNewTab(article.content) }}
                            />
                        </article>
                    )
                })}
            </div>
             {articles.length > 1 && (
                <div className="fixed bottom-20 sm:bottom-8 right-4 sm:right-8 z-50 flex flex-col gap-2">
                    <button
                        onClick={handlePrev}
                        disabled={currentlyVisibleArticleIndex === 0}
                        className="p-3 bg-gray-800/80 backdrop-blur-sm rounded-full text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        title="Previous Article (Scroll Up)"
                    >
                        <ChevronUpIcon className="w-6 h-6" />
                    </button>
                    <button
                        onClick={handleNext}
                        disabled={currentlyVisibleArticleIndex >= articles.length - 1}
                        className="p-3 bg-gray-800/80 backdrop-blur-sm rounded-full text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        title="Next Article (Scroll Down)"
                    >
                        <ChevronDownIcon className="w-6 h-6" />
                    </button>
                </div>
            )}
        </div>
    );
};

interface FeedContentProps {
    articles: Article[];
    isLoading: boolean;
    emptyMessage: string;
    onOpenArticle: (article: Article) => void;
    readArticleIds: Map<string, number>;
    readLaterArticleIds: Set<string>;
    onToggleReadLater: (articleId: string) => void;
    articleZoomLevel: GridZoomLevel;
    articleViewMode: 'grid' | 'list';
    selectedArticleIds: Set<string>;
    onToggleArticleSelection: (articleId: string) => void;
    isReorderable: boolean;
    onReorder: (sourceId: string, targetId: string | null) => void;
}

const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
    </div>
);

export const FeedContent: React.FC<FeedContentProps> = ({
    articles, isLoading, emptyMessage, onOpenArticle, readArticleIds,
    readLaterArticleIds, onToggleReadLater, articleZoomLevel, articleViewMode, selectedArticleIds,
    onToggleArticleSelection, isReorderable, onReorder
}) => {
    
    const [draggedId, setDraggedId] = useState<string | null>(null);

    const gridClasses: Record<GridZoomLevel, string> = {
        sm: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
        md: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
        lg: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
        xl: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8',
    };

    const handleDragStart = (e: React.DragEvent<HTMLElement>, articleId: string) => {
        e.dataTransfer.setData('text/plain', articleId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => setDraggedId(articleId), 0);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('text/plain');
        if (sourceId && targetId && sourceId !== targetId) {
            onReorder(sourceId, targetId);
        }
        setDraggedId(null);
    };
    
    const renderContent = () => {
        if (isLoading) {
            return <LoadingSpinner />;
        }

        if (articles.length === 0) {
            return <div className="text-center text-gray-500 mt-10">{emptyMessage}</div>;
        }

        if (articleViewMode === 'list') {
            return (
                <div className="p-2 sm:p-4 space-y-2">
                    {articles.map(article => (
                        <ArticleListItem
                            key={article.id}
                            article={article}
                            onOpenArticle={onOpenArticle}
                            isRead={readArticleIds.has(article.id)}
                            isReadLater={readLaterArticleIds.has(article.id)}
                            onToggleReadLater={onToggleReadLater}
                            isSelected={selectedArticleIds.has(article.id)}
                            onToggleSelection={onToggleArticleSelection}
                            isReorderable={isReorderable}
                            isBeingDragged={draggedId === article.id}
                            isDragInProgress={!!draggedId}
                            onDragStart={(e) => handleDragStart(e, article.id)}
                            onDragEnd={handleDragEnd}
                            onDrop={handleDrop}
                        />
                    ))}
                </div>
            );
        }

        return (
             <div className={`grid gap-6 p-6 ${gridClasses[articleZoomLevel]}`}>
                {articles.map(article => (
                    <ArticleCard 
                        key={article.id} 
                        article={article} 
                        onOpenArticle={onOpenArticle}
                        isRead={readArticleIds.has(article.id)}
                        isReadLater={readLaterArticleIds.has(article.id)}
                        onToggleReadLater={onToggleReadLater}
                        zoomLevel={articleZoomLevel}
                        isSelected={selectedArticleIds.has(article.id)}
                        onToggleSelection={onToggleArticleSelection}
                        isReorderable={isReorderable}
                        isBeingDragged={draggedId === article.id}
                        isDragInProgress={!!draggedId}
                        onDragStart={(e) => handleDragStart(e, article.id)}
                        onDragEnd={handleDragEnd}
                        onDrop={handleDrop}
                    />
                ))}
            </div>
        );
    }
    
    return (
        <div className="flex-1 overflow-y-auto bg-gray-900">
           {renderContent()}
        </div>
    );
};
