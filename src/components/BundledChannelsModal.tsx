import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, PackageIcon, PlusIcon, CheckCircleIcon } from './icons';
import type { Feed } from '../types';

// Statically import the JSON files which contain the feed data.
import scienceBundle from '../bundled/media-feeder-backup-tag-science.json';
import techBundle from '../bundled/media-feeder-backup-tag-tech.json';
import gadgetsBundle from '../bundled/media-feeder-backup-tag-gadgets.json';

// Define the structure for the channel bundles.
const bundles = [
  {
    name: 'Science',
    data: scienceBundle.feeds as Omit<Feed, 'id' | 'items' | 'error'>[],
    description: 'Feeds related to science and discovery.',
  },
  {
    name: 'Tech',
    data: techBundle.feeds as Omit<Feed, 'id' | 'items' | 'error'>[],
    description: 'General technology news and analysis.',
  },
  {
    name: 'Gadgets',
    data: gadgetsBundle.feeds as Omit<Feed, 'id' | 'items' | 'error'>[],
    description: 'Reviews and news about consumer electronics.',
  },
];

export const BundledChannelsModal: React.FC = () => {
  const {
    isBundledChannelsModalOpen,
    setIsBundledChannelsModalOpen,
    handleImportBundledChannels,
    feeds,
  } = useAppContext();
  const [isAddingBundle, setIsAddingBundle] = useState<string | null>(null);

  const isOpen = isBundledChannelsModalOpen;
  const onClose = () => setIsBundledChannelsModalOpen(false);

  // Memoize the set of existing feed URLs for efficient duplicate checking.
  const existingUrls = useMemo(() => new Set(feeds.map(f => f.url)), [feeds]);

  useEffect(() => {
    if (isOpen) {
      setIsAddingBundle(null);
    }
  }, [isOpen]);

  const handleImportClick = (
    bundleName: string,
    feedsToImport: Omit<Feed, 'id' | 'items' | 'error'>[]
  ) => {
    setIsAddingBundle(bundleName);
    try {
      handleImportBundledChannels(feedsToImport);
    } catch (e) {
      console.error(`Failed to import bundle ${bundleName}:`, e);
    } finally {
      // The loading state is primarily for visual feedback; the toast from the context is the main success indicator.
      setTimeout(() => {
        setIsAddingBundle(null);
      }, 500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl h-[90vh] m-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-700 flex-shrink-0 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center">
            <PackageIcon className="w-6 h-6 mr-3 text-indigo-400" />
            Add Channel Bundles
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon className="w-6 h-6" />
          </button>
        </header>
        <div className="p-6 flex-1 overflow-y-auto">
          <p className="text-gray-400 mb-6">
            Quickly add a set of curated channels based on a topic. The app will skip any channels
            you already subscribe to.
          </p>
          <div className="space-y-4">
            {bundles.map(bundle => {
              const channelsInBundle = bundle.data;
              const newChannels = channelsInBundle.filter(f => !existingUrls.has(f.url));
              const areAllAdded = newChannels.length === 0;
              const isLoading = isAddingBundle === bundle.name;

              return (
                <div
                  key={bundle.name}
                  className="bg-gray-700/50 rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start"
                >
                  <div className="flex-grow">
                    <h3 className="font-bold text-lg text-gray-100">{bundle.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">{bundle.description}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Contains {channelsInBundle.length} channels.
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-full sm:w-auto">
                    <button
                      onClick={() => handleImportClick(bundle.name, newChannels)}
                      disabled={areAllAdded || isLoading}
                      className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed
                                                ${areAllAdded 
                                                    ? 'bg-green-600/30 text-green-400' 
                                                    : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-400/50'
                                                }"
                    >
                      {isLoading ? (
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
                      ) : areAllAdded ? (
                        <>
                          <CheckCircleIcon className="w-5 h-5 mr-2" /> All Added
                        </>
                      ) : (
                        <>
                          <PlusIcon className="w-5 h-5 mr-2" /> Add {newChannels.length} Feeds
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <footer className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
