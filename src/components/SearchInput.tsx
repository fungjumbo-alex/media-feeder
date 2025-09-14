
import React, { useState, useEffect } from 'react';
import { SearchIcon, XIcon } from './icons';

interface SearchInputProps {
    onSearch: (query: string) => void;
    onClear: () => void;
    initialValue?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({ onSearch, onClear, initialValue = '' }) => {
    const [query, setQuery] = useState(initialValue);

    useEffect(() => {
        setQuery(initialValue);
    }, [initialValue]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && query.trim()) {
            onSearch(query.trim());
        }
    };

    const handleClear = () => {
        setQuery('');
        onClear();
    };

    const handleSearchClick = () => {
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    return (
        <div className="relative w-full">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search all articles..."
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-md pl-10 pr-10 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            />
            <button
                onClick={handleSearchClick}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                aria-label="Search"
            >
                <SearchIcon className="w-5 h-5" />
            </button>
            {query && (
                <button
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    aria-label="Clear search"
                >
                    <XIcon className="w-5 h-5" />
                </button>
            )}
        </div>
    );
};