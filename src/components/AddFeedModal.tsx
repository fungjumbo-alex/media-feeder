import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon } from './icons';
import { discoverFeeds, isWebsiteUrl, type DiscoveredFeed } from '../utils/feedDiscovery';

export const AddFeedModal: React.FC = () => {
  const {
    isAddFeedModalOpen,
    setAddFeedModalOpen,
    handleAddFeed,
    urlFromExtension,
    setUrlFromExtension,
    enableRssAndReddit,
  } = useAppContext();
  const [url, setUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredFeeds, setDiscoveredFeeds] = useState<DiscoveredFeed[]>([]);
  const [noFeedsFound, setNoFeedsFound] = useState(false);

  const onClose = useCallback(() => {
    setAddFeedModalOpen(false);
    // After closing, ensure the extension URL is cleared so it doesn't pre-fill next time.
    if (urlFromExtension) {
      setUrlFromExtension(null);
    }
  }, [setAddFeedModalOpen, urlFromExtension, setUrlFromExtension]);

  useEffect(() => {
    if (isAddFeedModalOpen) {
      // When modal opens, pre-fill URL if it came from the extension, otherwise reset state.
      setUrl(urlFromExtension || '');
      setError(null);
      setIsAdding(false);
      setIsDiscovering(false);
      setDiscoveredFeeds([]);
      setNoFeedsFound(false);
    }
  }, [isAddFeedModalOpen, urlFromExtension]);

  useEffect(() => {
    if (!isAddFeedModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddFeedModalOpen, onClose]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) setError(null);
    // Reset discovery state when URL changes
    if (discoveredFeeds.length > 0 || noFeedsFound) {
      setDiscoveredFeeds([]);
      setNoFeedsFound(false);
    }
  };

  const handleSelectDiscoveredFeed = async (feedUrl: string) => {
    setIsAdding(true);
    setError(null);
    try {
      await handleAddFeed(feedUrl);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unknown error occurred while adding the feed.'
      );
    } finally {
      setIsAdding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || isAdding) return;

    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const isBilibili = url.includes('bilibili.com');
    const isPastebin = url.includes('pastebin.com');
    const isShareCode =
      (/^[a-zA-Z0-9]+$/.test(url.trim()) && !url.includes('.')) || url.includes('#/import');
    const isPasteGG = url.includes('paste.gg/');
    const isAllowedWithoutSetting = isYouTube || isBilibili;

    if (
      !isAllowedWithoutSetting &&
      !isPastebin &&
      !isPasteGG &&
      !isShareCode &&
      !enableRssAndReddit
    ) {
      setError(
        'To add RSS or Reddit feeds, please enable them in the main settings menu (Actions & Settings > Settings).'
      );
      return;
    }

    // ---- Auto-discovery for regular website URLs ----
    if (enableRssAndReddit && isWebsiteUrl(url)) {
      setIsDiscovering(true);
      setDiscoveredFeeds([]);
      setNoFeedsFound(false);
      setError(null);
      try {
        const feeds = await discoverFeeds(url);
        if (feeds.length > 0) {
          setDiscoveredFeeds(feeds);
        } else {
          setNoFeedsFound(true);
        }
      } catch (err) {
        console.warn('[Feed Discovery] Error:', err);
        setNoFeedsFound(true);
      } finally {
        setIsDiscovering(false);
      }
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      await handleAddFeed(url);
      onClose(); // Close modal on success
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unknown error occurred while adding the feed.'
      );
    } finally {
      setIsAdding(false);
    }
  };

  if (!isAddFeedModalOpen) return null;

  const isImportingFromShare =
    isAdding &&
    ((/^[a-zA-Z0-9]+$/.test(url.trim()) && !url.includes('.')) ||
      url.includes('#/import') ||
      url.includes('paste.gg/'));
  const isImportingFromPastebin = isAdding && url.includes('pastebin.com');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md m-4 relative max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <XIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-white mb-4">Follow a New Source</h2>
        <p className="text-gray-400 mb-6">
          Enter a feed URL, a YouTube/Bilibili/Reddit page, or a share link/code to import data.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="feed-url" className="text-sm font-medium text-gray-400">
                Source URL, Link, or Code
              </label>
              <input
                id="feed-url"
                type="text"
                value={url}
                onChange={handleUrlChange}
                placeholder="e.g., wired.com, .../#/import/qez7S, or qez7S"
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition mt-1"
                required
                autoFocus
              />
            </div>
          </div>
          {error && (
            <div className="mt-4 text-sm text-red-400 bg-red-900/40 p-3 rounded-md">{error}</div>
          )}
          {/* Discovery loading state */}
          {isDiscovering && (
            <div className="mt-4 text-sm text-indigo-300 bg-indigo-900/40 p-3 rounded-md flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4 text-indigo-300"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Discovering feeds…
            </div>
          )}
          {/* No feeds found */}
          {noFeedsFound && !isDiscovering && (
            <div className="mt-4 text-sm text-yellow-300 bg-yellow-900/40 p-3 rounded-md">
              No feeds found at this URL. Try entering the direct RSS/Atom feed URL instead.
            </div>
          )}
          {/* Discovered feeds list */}
          {discoveredFeeds.length > 0 && !isDiscovering && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-300 mb-2">
                Found {discoveredFeeds.length} feed{discoveredFeeds.length > 1 ? 's' : ''} — select one to add:
              </p>
              <div className="space-y-2">
                {discoveredFeeds.map((feed) => (
                  <button
                    key={feed.url}
                    type="button"
                    onClick={() => handleSelectDiscoveredFeed(feed.url)}
                    disabled={isAdding}
                    className="w-full text-left bg-gray-900/70 border border-gray-700 hover:border-indigo-500 hover:bg-gray-700/50 rounded-md p-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="text-sm text-white font-medium truncate">
                      {feed.title || 'Untitled Feed'}
                    </div>
                    <div className="text-xs text-gray-400 truncate mt-0.5">{feed.url}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdding || isDiscovering}
              className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
            >
              {isImportingFromShare
                ? 'Importing...'
                : isImportingFromPastebin
                  ? 'Importing...'
                  : isAdding
                    ? 'Checking...'
                    : isDiscovering
                      ? 'Discovering...'
                      : 'Add Feed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
