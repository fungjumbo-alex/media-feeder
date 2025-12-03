import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, YouTubeIcon, CheckCircleIcon } from './icons';
import type { YouTubeSubscription } from '../types';

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col justify-center items-center h-full text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
    <p className="text-lg text-gray-300">Fetching your subscriptions from YouTube...</p>
    <p className="text-sm text-gray-500">This may take a moment.</p>
  </div>
);
const ErrorDisplay: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col justify-center items-center h-full">
    <div className="bg-red-500/10 text-red-400 p-4 rounded-lg m-4 text-center">
      <p className="font-semibold">An error occurred:</p>
      <p>{message}</p>
      {message.toLowerCase().includes('permission') && (
        <p className="mt-1 text-xs">
          The app may not have sufficient permissions. Please try authenticating again.
        </p>
      )}
    </div>
    <button
      onClick={onRetry}
      className="mt-4 px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
    >
      {message.toLowerCase().includes('permission') ? 'Re-authenticate' : 'Try Again'}
    </button>
  </div>
);

export const ImportYouTubeModal: React.FC = () => {
  const {
    isImportYouTubeModalOpen,
    setIsImportYouTubeModalOpen,
    youTubeImportState,
    handleFetchYouTubeSubscriptions,
    handleClearYouTubeImportState,
    handleAddYouTubeChannels,
    feeds,
  } = useAppContext();

  const [selectedSubscriptionIds, setSelectedSubscriptionIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  const { status, subscriptions, error } = youTubeImportState;
  const existingChannelIds = useMemo(() => {
    const idSet = new Set<string>();
    const ytRegex = /(UC[\w-]{22})/;
    feeds.forEach(feed => {
      if (feed.url.includes('youtube.com')) {
        const match = feed.url.match(ytRegex);
        if (match && match[1]) {
          idSet.add(match[1]);
        }
      }
    });
    return idSet;
  }, [feeds]);

  const channelsToShow = useMemo(() => {
    return subscriptions.filter(
      (sub: YouTubeSubscription) => !existingChannelIds.has(sub.channelId)
    );
  }, [subscriptions, existingChannelIds]);

  const isAllSelected = useMemo(() => {
    return channelsToShow.length > 0 && selectedSubscriptionIds.size === channelsToShow.length;
  }, [channelsToShow, selectedSubscriptionIds]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSubscriptionIds(new Set(channelsToShow.map((c: YouTubeSubscription) => c.id)));
    } else {
      setSelectedSubscriptionIds(new Set());
    }
  };

  const handleToggleSelection = (subId: string) => {
    setSelectedSubscriptionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subId)) {
        newSet.delete(subId);
      } else {
        newSet.add(subId);
      }
      return newSet;
    });
  };

  const handleConfirmAdd = async () => {
    const selectedSubs = subscriptions.filter((sub: YouTubeSubscription) =>
      selectedSubscriptionIds.has(sub.id)
    );
    if (selectedSubs.length === 0) return;

    setIsAdding(true);
    try {
      await handleAddYouTubeChannels(selectedSubs);
      onClose(); // Parent handles adding and closes modal
    } catch (e) {
      // Error handling for adding is done in the context, showing a toast
      console.error('Error adding YouTube channels:', e);
    } finally {
      setIsAdding(false);
    }
  };

  const onClose = () => {
    setIsImportYouTubeModalOpen(false);
  };

  useEffect(() => {
    if (!isImportYouTubeModalOpen) {
      // Delay reset to allow for fade-out animation
      setTimeout(() => {
        handleClearYouTubeImportState();
        setSelectedSubscriptionIds(new Set());
        setIsAdding(false);
      }, 300);
    }
  }, [isImportYouTubeModalOpen, handleClearYouTubeImportState]);

  if (!isImportYouTubeModalOpen) return null;

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return <LoadingSpinner />;
      case 'error':
        return (
          <ErrorDisplay
            message={error || 'An unknown error occurred.'}
            onRetry={handleFetchYouTubeSubscriptions}
          />
        );
      case 'loaded':
        if (channelsToShow.length === 0) {
          return (
            <div className="text-center text-gray-400 p-8">
              All your YouTube subscriptions are already in the app!
            </div>
          );
        }
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 p-3 bg-gray-900/50 border-b border-gray-700 flex-shrink-0">
              <input
                id="select-all-yt"
                type="checkbox"
                checked={isAllSelected}
                onChange={e => handleSelectAll(e.target.checked)}
                className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="select-all-yt" className="text-sm font-semibold text-gray-300">
                Select All ({selectedSubscriptionIds.size} / {channelsToShow.length})
              </label>
            </div>
            <div className="flex-grow overflow-y-auto">
              {channelsToShow.map((sub: YouTubeSubscription) => (
                <div
                  key={sub.id}
                  onClick={() => handleToggleSelection(sub.id)}
                  className="flex items-center gap-4 p-3 border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/50"
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={selectedSubscriptionIds.has(sub.id)}
                    className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500 pointer-events-none"
                  />
                  <img
                    src={sub.thumbnailUrl}
                    alt={sub.title}
                    className="w-10 h-10 rounded-full bg-gray-700"
                  />
                  <div className="flex-grow min-w-0">
                    <p className="font-semibold text-gray-200 truncate">{sub.title}</p>
                    <p className="text-xs text-gray-400 truncate">{sub.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="text-center flex flex-col items-center justify-center h-full px-4">
            <YouTubeIcon className="w-16 h-16 text-red-500 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Import YouTube Subscriptions</h3>
            <p className="text-gray-400 mb-6 max-w-lg">
              Fetch your full list of subscriptions from YouTube and add them to your reader in one
              go.
            </p>
            <button
              onClick={handleFetchYouTubeSubscriptions}
              className="px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
            >
              Fetch My Subscriptions
            </button>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl h-[90vh] m-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-700 flex-shrink-0 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center">
            <YouTubeIcon className="w-6 h-6 mr-3 text-red-500" />
            Import from YouTube
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon className="w-6 h-6" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto min-h-0">{renderContent()}</div>
        {status === 'loaded' && channelsToShow.length > 0 && (
          <footer className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800/80 flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmAdd}
              disabled={isAdding || selectedSubscriptionIds.size === 0}
              className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed flex items-center"
            >
              {isAdding ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Adding...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-5 h-5 mr-2" />
                  Add Selected ({selectedSubscriptionIds.size})
                </>
              )}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};
