
import React from 'react';
import { useAppContext } from '../contexts/AppContext';

export const TagFilterBar: React.FC = () => {
    const { availableTagsForFilter, activeTagFilter, handleSetTagFilter } = useAppContext();

    if (availableTagsForFilter.length === 0) {
        return null;
    }

    return (
        <div className="flex-shrink-0 bg-gray-800/50 border-b border-gray-700 px-4 py-2 flex items-center gap-2">
            <label htmlFor="tag-filter" className="text-sm font-semibold text-gray-400 flex-shrink-0">Filter by Tag:</label>
            <div className="relative">
                <select
                    id="tag-filter"
                    value={activeTagFilter || ''}
                    onChange={(e) => handleSetTagFilter(e.target.value || null)}
                    className="bg-gray-700 text-white font-semibold py-1.5 pl-3 pr-8 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    aria-label="Filter articles by tag"
                >
                    <option value="">All Tags</option>
                    {availableTagsForFilter.map(tag => (
                        <option key={tag} value={tag}>{tag}</option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
            </div>
        </div>
    );
};
