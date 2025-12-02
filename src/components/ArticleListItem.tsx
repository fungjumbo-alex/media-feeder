import React from 'react';
import type { Article } from '../types';
import { BookmarkIcon, EyeIcon, RssIcon, YouTubeIcon } from './icons';
import { formatRelativeDate } from '../utils/dateUtils';

interface ArticleListItemProps {
    article: Article;
    onOpenArticle: (article: Article) => void;
    isRead: boolean;
    isReadLater: boolean;
    onToggleReadLater: (articleId: string) => void;
    isSelected: boolean;
    onToggleSelection: (articleId: string) => void;
    isReorderable: boolean;
    isBeingDragged: boolean;
    isDragInProgress: boolean;
    onDragStart: (e: React.DragEvent<HTMLAnchorElement>) => void;
    onDragEnd: (e: React.DragEvent<HTMLAnchorElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, articleId: string) => void;
}

export const ArticleListItem: React.FC<ArticleListItemProps> = ({
    article, onOpenArticle, isRead, isReadLater, onToggleReadLater,
    isSelected, onToggleSelection, isReorderable, isBeingDragged,
    isDragInProgress, onDragStart, onDragEnd, onDrop
}) => {
    const handleToggleReadLater = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleReadLater(article.id);
    };

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (e.button === 1 || e.metaKey || e.ctrlKey) {
            return; // Allow native browser behavior for new tabs
        }
        e.preventDefault();
        onOpenArticle(article);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const FeedIcon = article.isVideo ? YouTubeIcon : RssIcon;
    const iconColor = article.isVideo ? 'text-red-500' : 'text-gray-400';
    const articleUrl = `#/article/${encodeURIComponent(article.feedId)}/${encodeURIComponent(article.id)}`;

    return (
        <div className="relative">
            <a
                href={articleUrl}
                onClick={handleClick}
                draggable={isReorderable}
                onDragStart={isReorderable ? onDragStart : undefined}
                onDragEnd={isReorderable ? onDragEnd : undefined}
                className={`bg-gray-800 rounded-lg shadow-sm hover:bg-gray-700/50 flex items-center gap-3 sm:gap-4 p-2 transition-all duration-200 ${isReorderable ? 'cursor-grab' : 'cursor-pointer'} ${isRead ? 'opacity-60 hover:opacity-100' : ''} ${isSelected ? 'ring-2 ring-indigo-500' : ''} ${isBeingDragged ? 'opacity-30' : ''}`}
            >
                {/* Checkbox */}
                <div className="flex-shrink-0">
                    <label className="flex items-center justify-center p-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelection(article.id)}
                            className="h-5 w-5 rounded border-gray-600 bg-gray-900 checked:bg-indigo-600 checked:border-indigo-600 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 outline-none cursor-pointer"
                            aria-label={`Select article: ${article.title}`}
                        />
                    </label>
                </div>

                {/* Thumbnail */}
                <div className="flex-shrink-0 w-16 h-9 bg-gray-700 rounded overflow-hidden">
                    {article.imageUrl ? (
                        <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <FeedIcon className={`w-6 h-6 ${iconColor}`} />
                        </div>
                    )}
                </div>

                {/* Title */}
                <div className="flex-grow min-w-0">
                    <p className="font-semibold text-gray-100 truncate" title={article.title}>{article.title}</p>
                </div>

                {/* Metadata (desktop only) */}
                <div className="hidden sm:flex flex-shrink-0 flex-col items-end text-xs text-gray-400 w-32 ml-auto">
                    <p className="truncate w-full text-right" title={article.feedTitle}>{article.feedTitle}</p>
                    <div className="flex items-center gap-2 justify-end w-full">
                        {article.isVideo && article.duration != null && (
                            <span className="text-indigo-400 font-medium">
                                {(() => {
                                    const hours = Math.floor(article.duration / 3600);
                                    const minutes = Math.floor((article.duration % 3600) / 60);
                                    const seconds = article.duration % 60;
                                    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                                    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                })()}
                            </span>
                        )}
                        <p>{formatRelativeDate(article.pubDateTimestamp)}</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    {isRead && <span title="Read"><EyeIcon className="w-5 h-5 text-indigo-400" /></span>}
                    <button
                        onClick={handleToggleReadLater}
                        className={`p-1.5 rounded-full transition-colors ${isReadLater ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`}
                        aria-label={isReadLater ? 'Remove from Read Later' : 'Save for Read Later'}
                        title={isReadLater ? 'Remove from Read Later' : 'Save for Read Later'}
                    >
                        <BookmarkIcon className={`w-5 h-5 ${isReadLater ? 'fill-current' : ''}`} />
                    </button>
                </div>
            </a>
            {isReorderable && isDragInProgress && !isBeingDragged && (
                <div
                    onDrop={(e) => onDrop(e, article.id)}
                    onDragOver={handleDragOver}
                    className="absolute inset-0 z-10 bg-indigo-500/10 border-2 border-dashed border-indigo-500 rounded-lg"
                />
            )}
        </div>
    );
};