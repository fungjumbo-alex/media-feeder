
import React from 'react';
import type { Feed } from '../types';
import { FeedGridCard } from './FeedGridCard';

type GridZoomLevel = 'sm' | 'md' | 'lg' | 'xl';

interface FeedGridProps {
    feeds: Feed[];
    onSelectFeed: (feedId: string) => void;
    unreadCounts: Record<string, number>;
    gridZoomLevel: GridZoomLevel;
    isRefreshing: boolean;
}

export const FeedGrid: React.FC<FeedGridProps> = ({ feeds, onSelectFeed, unreadCounts, gridZoomLevel, isRefreshing }) => {
    const gridClasses: Record<GridZoomLevel, string> = {
        sm: 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6', // Larger cards
        md: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8', // Default
        lg: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12', // Smaller cards
        xl: 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 xl:grid-cols-16 2xl:grid-cols-20', // Smallest cards, no title
    };

    if (isRefreshing && feeds.length === 0) {
        return (
             <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className={`grid gap-4 sm:gap-6 ${gridClasses[gridZoomLevel]}`}>
                {feeds.map(feed => (
                    <FeedGridCard 
                        key={feed.id} 
                        feed={feed} 
                        onSelectFeed={onSelectFeed} 
                        unreadCount={unreadCounts[feed.id] || 0}
                        zoomLevel={gridZoomLevel}
                    />
                ))}
            </div>
        </div>
    );
};
