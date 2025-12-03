import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import type { RecommendedFeed } from '../types';
import { XIcon, SparklesIcon, PlusIcon, CheckCircleIcon } from './icons';

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col justify-center items-center h-full text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
    <p className="text-lg text-gray-300">Finding related channels...</p>
    <p className="text-sm text-gray-500">The AI is analyzing the source feed.</p>
  </div>
);
const ErrorDisplay: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col justify-center items-center h-full">
    <div className="bg-red-500/10 text-red-400 p-4 rounded-lg m-4 text-center">
      <p className="font-semibold">An error occurred:</p>
      <p>{message}</p>
    </div>
    <button
      onClick={onRetry}
      className="mt-4 px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
    >
      Try Again
    </button>
  </div>
);

export const RelatedChannelsModal: React.FC = () => {
  const {
    isRelatedModalOpen,
    handleCloseRelatedModal,
    relatedChannelsState,
    handleGenerateRelated,
    handleAddFromRecommendation,
    feeds,
    relatedSourceFeedId,
  } = useAppContext();
  const { recommendations, isLoading, error } = relatedChannelsState;
  const [addingStates, setAddingStates] = useState<Record<string, 'idle' | 'adding' | 'error'>>({});

  const isOpen = isRelatedModalOpen;
  const onClose = handleCloseRelatedModal;
  const onGenerate = handleGenerateRelated;
  const onAddFeed = handleAddFromRecommendation;
  const existingFeedUrls = useMemo(() => new Set(feeds.map(f => f.url)), [feeds]);
  const sourceFeed = useMemo(
    () => feeds.find(f => f.id === relatedSourceFeedId) || null,
    [feeds, relatedSourceFeedId]
  );

  useEffect(() => {
    if (isOpen) setAddingStates({});
  }, [isOpen, sourceFeed]);
  useEffect(() => {
    if (isOpen && sourceFeed && !recommendations && !isLoading && !error) onGenerate();
  }, [isOpen, sourceFeed, recommendations, isLoading, error, onGenerate]);

  const handleAdd = (rec: RecommendedFeed) => {
    setAddingStates(prev => ({ ...prev, [rec.url]: 'adding' }));
    const tagsToInherit = sourceFeed?.tags && Array.isArray(sourceFeed.tags) ? sourceFeed.tags : [];
    onAddFeed(rec.url, rec.title, tagsToInherit).catch(e => {
      console.error('Failed to add feed from related channels:', e);
      setAddingStates(prev => ({ ...prev, [rec.url]: 'error' }));
    });
  };

  const recommendationsToShow = useMemo(() => {
    if (!recommendations) return [];
    return recommendations.filter(rec => {
      try {
        new URL(rec.url);
        return true;
      } catch {
        return false;
      }
    });
  }, [recommendations]);

  if (!isOpen) return null;

  const renderContent = () => {
    if (isLoading) return <LoadingSpinner />;
    if (error) return <ErrorDisplay message={error} onRetry={onGenerate} />;
    if (!recommendations || recommendationsToShow.length === 0) {
      return (
        <div className="text-center text-gray-400 p-8">
          <p>The AI couldn't find any related channels for "{sourceFeed?.title}".</p>
          <button
            onClick={onGenerate}
            className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm font-semibold"
          >
            Try Again
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {recommendationsToShow.map(rec => {
          const isAdded = existingFeedUrls.has(rec.url);
          const statusInFlight = addingStates[rec.url];
          return (
            <div
              key={rec.url}
              className="bg-gray-700/50 rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start"
            >
              <div className="flex-grow">
                <h4 className="font-bold text-lg text-gray-100">{rec.title}</h4>
                <p className="text-sm text-gray-400 mt-1 italic">"{rec.reason}"</p>
                <p className="text-xs text-gray-500 mt-2 truncate">{rec.url}</p>
              </div>
              <div className="flex-shrink-0 w-full sm:w-auto">
                {isAdded ? (
                  <button
                    disabled
                    className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md bg-green-600/30 text-green-400 font-semibold"
                  >
                    <CheckCircleIcon className="w-5 h-5 mr-2" /> Added
                  </button>
                ) : statusInFlight === 'adding' ? (
                  <button
                    disabled
                    className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md bg-indigo-400/50 text-white font-semibold cursor-wait"
                  >
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
                  </button>
                ) : statusInFlight === 'error' ? (
                  <button
                    onClick={() => handleAdd(rec)}
                    className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-500"
                  >
                    Error! Retry
                  </button>
                ) : (
                  <button
                    onClick={() => handleAdd(rec)}
                    className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                  >
                    <PlusIcon className="w-5 h-5 mr-2" /> Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl h-[90vh] m-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-700 flex-shrink-0 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <SparklesIcon className="w-6 h-6 text-indigo-400" />
            <span className="truncate">
              Related to:{' '}
              <span className="font-semibold text-indigo-300">{sourceFeed?.title || '...'}</span>
            </span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon className="w-6 h-6" />
          </button>
        </header>
        <div className="p-6 flex-1 overflow-y-auto">{renderContent()}</div>
        <footer className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800/50 flex justify-end">
          <button
            onClick={onGenerate}
            disabled={isLoading}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {isLoading ? 'Searching...' : 'Find More Suggestions'}
          </button>
        </footer>
      </div>
    </div>
  );
};
