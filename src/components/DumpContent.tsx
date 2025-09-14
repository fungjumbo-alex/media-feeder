import React, { useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';

export const DumpContent: React.FC = () => {
    const {
        allTags,
        feedsByTag,
        unreadCounts,
        unreadTagCounts,
        favoriteFeeds,
        unreadFavoritesCount,
    } = useAppContext();

    const jsonData = useMemo(() => {
        // Build the structured data for views, following the requested schema.
        const views = [
            {
                name: 'All Subscriptions',
                path: '/#/all-subscriptions',
                channels: [],
            },
            {
                name: 'Favorites',
                path: '/#/favorites',
                unreadCount: unreadFavoritesCount,
                channels: favoriteFeeds.map(feed => ({
                    url: feed.id,
                    title: feed.title,
                    unreadCount: unreadCounts[feed.id] || 0,
                })),
            },
            {
                name: 'Read Later',
                path: '/#/readLater',
                channels: [],
            },
            {
                name: 'Published Today',
                path: '/#/published-today',
                channels: [],
            },
            {
                name: 'History',
                path: '/#/history',
                channels: [],
            },
            {
                name: 'Inactive Feeds',
                path: '/#/inactive-feeds',
                channels: [],
            },
            {
                name: 'Dump URLs',
                path: '/#/dump',
                channels: [],
            }
        ];

        // Build the structured data for tags.
        const tags = allTags.map(tag => ({
            name: tag,
            unreadCount: unreadTagCounts[tag] || 0,
            channels: (feedsByTag.get(tag) || []).map(feed => ({
                url: feed.id,
                title: feed.title,
                unreadCount: unreadCounts[feed.id] || 0,
            })),
        }));
        
        // Build the structured data for actions.
        const actions = [
            { name: 'Refresh All Feeds', path: '/#/refresh-all' },
            { name: 'Refresh Favorite Feeds', path: '/#/refresh-favorites' },
            { name: 'Refresh Tagged Feeds', path: '/#/refresh-tagged' }
        ];

        const finalData = { views, tags, actions };

        // Convert the structured data to a formatted JSON string.
        return JSON.stringify(finalData, null, 2);

    }, [
        allTags,
        favoriteFeeds,
        feedsByTag,
        unreadCounts,
        unreadFavoritesCount,
        unreadTagCounts,
    ]);

    return (
        <div className="flex-1 overflow-auto bg-gray-900 p-6">
            <div className="bg-gray-800 p-4 rounded-lg">
                <pre className="text-gray-300 text-sm whitespace-pre-wrap break-all">
                    {jsonData}
                </pre>
            </div>
        </div>
    );
};