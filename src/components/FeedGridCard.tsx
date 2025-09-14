
import React, { useState, useMemo } from 'react';
import type { Feed } from '../types';

type GridZoomLevel = 'sm' | 'md' | 'lg' | 'xl';

interface FeedGridCardProps {
    feed: Feed;
    onSelectFeed: (feedId: string) => void;
    unreadCount: number;
    zoomLevel: GridZoomLevel;
}

const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 
    'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 
    'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500', 
    'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'
];

const getHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
};

export const FeedGridCard: React.FC<FeedGridCardProps> = ({ feed, onSelectFeed, unreadCount, zoomLevel }) => {
    const [hasError, setHasError] = useState(false);

    const handleIconError = () => {
        setHasError(true);
    };

    const fallbackColor = useMemo(() => {
        const hash = getHash(feed.title || 'Fallback');
        return colors[Math.abs(hash) % colors.length];
    }, [feed.title]);

    const initial = useMemo(() => {
        return (feed.title || 'F').charAt(0).toUpperCase();
    }, [feed.title]);

    const FallbackIcon = () => {
        const sizeClasses: Record<GridZoomLevel, string> = {
            sm: 'text-5xl lg:text-6xl',
            md: 'text-4xl lg:text-5xl',
            lg: 'text-3xl lg:text-4xl',
            xl: 'text-2xl lg:text-3xl',
        };

        return (
            <div className={`w-full h-full flex items-center justify-center rounded-lg ${fallbackColor}`}>
                <span className={`font-bold text-white/80 ${sizeClasses[zoomLevel]}`}>{initial}</span>
            </div>
        );
    };

    const renderUnreadIndicator = () => {
        if (unreadCount > 0) {
            return (
                <div className="absolute top-1 right-1 bg-indigo-600 text-white text-xs font-bold rounded-full px-2 py-1 flex items-center justify-center shadow-md border-2 border-gray-800">
                    {unreadCount}
                </div>
            );
        }
        return null;
    };
    
    const titleSizeClasses: Record<GridZoomLevel, string> = {
        sm: 'text-sm',
        md: 'text-sm',
        lg: 'text-xs',
        xl: 'text-xs',
    };

    return (
        <button 
            onClick={() => onSelectFeed(feed.id)}
            className="group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 rounded-lg"
            title={feed.title}
        >
            <div className="relative aspect-square w-full bg-gray-800 rounded-lg overflow-hidden shadow-lg transform group-hover:-translate-y-1 group-hover:shadow-indigo-500/40 transition-all duration-300">
                {feed.iconUrl && !hasError ? (
                    <img 
                        src={feed.iconUrl} 
                        alt={`${feed.title} icon`} 
                        className="w-full h-full object-cover" 
                        onError={handleIconError} 
                    />
                ) : (
                    <FallbackIcon />
                )}
                {renderUnreadIndicator()}
            </div>
            {zoomLevel !== 'xl' && (
                <div className="mt-2 text-center">
                    <h3 className={`font-semibold text-gray-200 group-hover:text-indigo-400 transition-colors duration-200 truncate ${titleSizeClasses[zoomLevel]}`}>
                        {feed.title}
                    </h3>
                </div>
            )}
        </button>
    );
};
