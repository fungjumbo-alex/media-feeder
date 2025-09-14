import React, { useState } from 'react';
import type { Article, GridZoomLevel } from '../types';
import { ArticleCard } from './ArticleCard';

interface FeedContentProps {
    articles: Article[];
    isLoading: boolean;
    emptyMessage: string;
    onOpenArticle: (article: Article) => void;
    readArticleIds: Map<string, number>;
    readLaterArticleIds: Set<string>;
    onToggleReadLater: (articleId: string) => void;
    articleZoomLevel: GridZoomLevel;
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
    readLaterArticleIds, onToggleReadLater, articleZoomLevel, selectedArticleIds,
    onToggleArticleSelection, isReorderable, onReorder
}) => {
    
    const [draggedId, setDraggedId] = useState<string | null>(null);

    const gridClasses: Record<GridZoomLevel, string> = {
        sm: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
        md: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
        lg: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
        xl: 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8',
    };

    const handleDragStart = (e: React.DragEvent<HTMLAnchorElement>, articleId: string) => {
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