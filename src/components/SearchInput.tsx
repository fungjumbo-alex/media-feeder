import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SearchIcon, XIcon } from './icons';
import { searchArticles, isSearchIndexReady } from '../utils/searchService';

interface SearchInputProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  initialValue?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  onSearch,
  onClear,
  initialValue = '',
}) => {
  const [query, setQuery] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  // Compute result count from the full-text index as user types
  const resultCount = useMemo(() => {
    if (!query.trim()) return undefined;
    return searchArticles(query.trim(), 1000).length;
  }, [query]);

  const indexReady = isSearchIndexReady();

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
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search all articles..."
        className="w-full bg-gray-900 border border-gray-700 text-white rounded-md pl-10 pr-24 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
      />
      <button
        onClick={handleSearchClick}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
        aria-label="Search"
      >
        <SearchIcon className="w-5 h-5" />
      </button>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        {query.trim() && resultCount !== undefined && (
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {resultCount} result{resultCount !== 1 ? 's' : ''}
          </span>
        )}
        {indexReady && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 whitespace-nowrap">
            full-text
          </span>
        )}
        {query && (
          <button
            onClick={handleClear}
            className="text-gray-400 hover:text-white"
            aria-label="Clear search"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
