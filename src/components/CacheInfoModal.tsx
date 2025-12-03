import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, DatabaseIcon, TrashIcon } from './icons';

export const CacheInfoModal: React.FC = () => {
  const {
    isCacheInfoModalOpen,
    setIsCacheInfoModalOpen,
    calculateStorageSize,
    handleClearArticlesCache,
  } = useAppContext();
  const [cacheSize, setCacheSize] = useState('Calculating...');

  const isOpen = isCacheInfoModalOpen;
  const onClose = () => setIsCacheInfoModalOpen(false);

  useEffect(() => {
    if (isOpen) {
      setCacheSize(calculateStorageSize());
    }
  }, [isOpen, calculateStorageSize]);

  const handleClearClick = () => {
    if (
      window.confirm(
        'Are you sure you want to clear the articles cache? This can help free up space but may require re-downloading content.'
      )
    ) {
      handleClearArticlesCache();
      setCacheSize(calculateStorageSize());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md m-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <XIcon className="w-6 h-6" />
        </button>
        <div className="flex items-center mb-4">
          <DatabaseIcon className="w-8 h-8 mr-3 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">Storage & Cache</h2>
        </div>
        <p className="text-gray-400 mb-6">
          This shows the total amount of space the application is using in your browser's local
          storage.
        </p>

        <div className="bg-gray-900/50 rounded-lg p-4 text-center mb-6">
          <p className="text-sm text-gray-400 mb-1">Total Used Storage</p>
          <p className="text-3xl font-bold text-white">{cacheSize}</p>
        </div>

        <button
          onClick={handleClearClick}
          className="w-full flex items-center justify-center px-6 py-3 rounded-md bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors"
        >
          <TrashIcon className="w-5 h-5 mr-2" />
          Clear Articles Cache
        </button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          This will remove cached articles to free up space but will keep your feeds and settings.
        </p>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
