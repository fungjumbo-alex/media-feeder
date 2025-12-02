import React from 'react';
import type { Article, GridZoomLevel } from '../types';
import { BookmarkIcon, EyeIcon } from './icons';
import { formatRelativeDate } from '../utils/dateUtils';

interface ArticleCardProps {
    article: Article;
    onOpenArticle: (article: Article) => void;
    isRead: boolean;
    isReadLater: boolean;
    onToggleReadLater: (articleId: string) => void;
    zoomLevel: GridZoomLevel;
    isSelected: boolean;
    onToggleSelection: (articleId: string) => void;
    isReorderable: boolean;
    isBeingDragged: boolean;
    isDragInProgress: boolean;
    onDragStart: (e: React.DragEvent<HTMLAnchorElement>) => void;
    onDragEnd: (e: React.DragEvent<HTMLAnchorElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, articleId: string) => void;
}

const formatDuration = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '';
    const date = new Date(0);
    date.setSeconds(seconds);
    const timeString = date.toISOString().substr(11, 8);
    if (timeString.startsWith('00:')) {
        return timeString.substr(3);
    }
    return timeString;
};

const formatViews = (views: number | null | undefined): string => {
    if (views === null || views === undefined) return '';
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K`;
    return `${views}`;
};

export const ArticleCard: React.FC<ArticleCardProps> = ({ 
    article, onOpenArticle, isRead, isReadLater, onToggleReadLater, 
    zoomLevel, isSelected, onToggleSelection, isReorderable, isBeingDragged,
    isDragInProgress, onDragStart, onDragEnd, onDrop
}) => {
    const handleToggleReadLater = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent opening the article modal
        onToggleReadLater(article.id);
    };

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        // Allow middle-click and ctrl/cmd-click for opening in a new tab
        if (e.button === 1 || e.metaKey || e.ctrlKey) {
            return;
        }
        // Prevent default navigation for left-click to handle via SPA logic
        e.preventDefault();
        onOpenArticle(article);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const titleSizeClasses: Record<GridZoomLevel, string> = {
        sm: 'text-lg',
        md: 'text-md',
        lg: 'text-base',
        xl: 'text-sm',
    };

    const imageSizeClasses: Record<GridZoomLevel, string> = {
        sm: 'h-48',
        md: 'h-40',
        lg: 'h-32',
        xl: 'h-24',
    };
    
    const articleUrl = `#/article/${encodeURIComponent(article.feedId)}/${encodeURIComponent(article.id)}`;

    return (
        <a
            href={articleUrl}
            onClick={handleClick}
            draggable={isReorderable}
            onDragStart={isReorderable ? onDragStart : undefined}
            onDragEnd={isReorderable ? onDragEnd : undefined}
            className={`relative bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-indigo-500/40 transition-all duration-300 flex flex-col group ${isReorderable ? 'cursor-grab' : 'cursor-pointer'} ${isRead ? 'opacity-60 hover:opacity-100' : ''} ${isSelected ? 'ring-2 ring-indigo-500' : ''} ${isBeingDragged ? 'opacity-30' : ''}`}
        >
            {isReorderable && isDragInProgress && !isBeingDragged && (
                <div
                    onDrop={(e) => onDrop(e, article.id)}
                    onDragOver={handleDragOver}
                    className="absolute inset-0 z-10 bg-indigo-500/10 border-2 border-dashed border-indigo-500 rounded-lg"
                />
            )}
            <div 
                className={`relative w-full overflow-hidden ${imageSizeClasses[zoomLevel]} ${article.isReddit && article.imageUrl ? 'bg-black' : ''}`}
            >
                {article.imageUrl ? (
                    <img src={article.imageUrl} alt={article.title} className={`w-full h-full ${article.isReddit ? 'object-contain' : 'object-cover group-hover:scale-105 transition-transform duration-300'}`} />
                ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-500">
                        No Image
                    </div>
                )}
                {article.isVideo && article.duration != null && (
                    <span className="absolute bottom-2 right-2 bg-black/75 text-white text-xs font-semibold px-1.5 py-0.5 rounded">
                        {formatDuration(article.duration)}
                    </span>
                )}
            </div>
            {zoomLevel !== 'xl' && (
                <div 
                    className="p-4 flex flex-col flex-grow"
                >
                    <h3 className={`font-bold text-gray-100 mb-2 leading-tight flex-grow ${titleSizeClasses[zoomLevel]}`}>{article.title}</h3>
                    {article.tags && article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                            {article.tags.map(tag => (
                                <span key={tag} className="px-1.5 py-0.5 text-xs font-medium bg-gray-700 text-gray-300 rounded-full">{tag}</span>
                            ))}
                        </div>
                    )}
                    <div className="mt-auto pt-2 border-t border-gray-700/50 flex justify-between items-center">
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">{article.feedTitle}</p>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
                                <span>{formatRelativeDate(article.pubDateTimestamp)}</span>
                                {article.isVideo && article.views != null && (
                                    <>
                                        <span>&middot;</span>
                                        <span>{formatViews(article.views)} views</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            {isRead && <span title="Read"><EyeIcon className="w-5 h-5 text-indigo-400"/></span>}
                            <button
                                onClick={handleToggleReadLater}
                                className={`p-1.5 rounded-full transition-colors ${isReadLater ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`}
                                aria-label={isReadLater ? 'Remove from Read Later' : 'Save for Read Later'}
                                title={isReadLater ? 'Remove from Read Later' : 'Save for Read Later'}
                            >
                                <BookmarkIcon className={`w-5 h-5 ${isReadLater ? 'fill-current' : ''}`} />
                            </button>
                            <label
                                className="flex items-center justify-center p-1 cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onToggleSelection(article.id);
                                }}
                            >
                                <div className="relative h-5 w-5">
                                    <input
                                        type="checkbox"
                                        readOnly
                                        checked={isSelected}
                                        className="appearance-none h-5 w-5 rounded border border-gray-600 bg-gray-900 checked:bg-indigo-600 checked:border-indigo-600 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 outline-none cursor-pointer"
                                        aria-label={`Select article: ${article.title}`}
                                    />
                                    {isSelected && (
                                        <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 text-white pointer-events-none" viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/>
                                        </svg>
                                    )}
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </a>
    );
};