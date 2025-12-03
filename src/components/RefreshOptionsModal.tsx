import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, RefreshIcon } from './icons';

export const RefreshOptionsModal: React.FC = () => {
  const {
    // FIX: Add missing properties to destructuring.
    isRefreshOptionsModalOpen,
    setIsRefreshOptionsModalOpen,
    handleExecuteRefresh,
    isRefreshingAll,
    refreshModalInitialState,
  } = useAppContext();

  const [refreshYT, setRefreshYT] = useState(true);
  const [refreshNonYT, setRefreshNonYT] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [ytMax, setYtMax] = useState(5);
  const [nonYtMax, setNonYtMax] = useState(10);

  useEffect(() => {
    if (isRefreshOptionsModalOpen) {
      if (refreshModalInitialState?.favoritesOnly) {
        setFavoritesOnly(true);
        setRefreshYT(false);
        setRefreshNonYT(false);
      } else {
        setFavoritesOnly(false);
        setRefreshYT(true);
        setRefreshNonYT(true);
      }
      setYtMax(5);
      setNonYtMax(10);
    }
  }, [isRefreshOptionsModalOpen, refreshModalInitialState]);

  useEffect(() => {
    if (favoritesOnly) {
      setRefreshYT(false);
      setRefreshNonYT(false);
    }
  }, [favoritesOnly]);

  useEffect(() => {
    if (refreshYT || refreshNonYT) {
      setFavoritesOnly(false);
    }
  }, [refreshYT, refreshNonYT]);

  const handleSubmit = () => {
    handleExecuteRefresh({
      yt: refreshYT,
      nonYt: refreshNonYT,
      favoritesOnly,
      ytMax: ytMax > 0 ? ytMax : 5,
      nonYtMax: nonYtMax > 0 ? nonYtMax : 10,
    });
  };

  const onClose = () => setIsRefreshOptionsModalOpen(false);
  if (!isRefreshOptionsModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg m-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <XIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <RefreshIcon className="w-6 h-6 text-indigo-400" />
          Refresh Feeds
        </h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-300 mb-2">Feeds to Refresh</h3>
            <div className="space-y-2 bg-gray-900/50 p-3 rounded-md">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={refreshYT}
                  onChange={e => setRefreshYT(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                />{' '}
                All YouTube Channels
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={refreshNonYT}
                  onChange={e => setRefreshNonYT(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                />{' '}
                All Non-YouTube Channels
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={favoritesOnly}
                  onChange={e => setFavoritesOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                />{' '}
                Favorites Only
              </label>
            </div>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-300 mb-2">Article Limits</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="yt-max" className="text-sm font-medium text-gray-400">
                  YouTube
                </label>
                <input
                  id="yt-max"
                  type="number"
                  value={ytMax}
                  onChange={e => setYtMax(parseInt(e.target.value, 10))}
                  min="1"
                  className="w-full bg-gray-900 border border-gray-700 text-white rounded-md p-2 focus:ring-2 focus:ring-indigo-500 outline-none transition mt-1"
                />
              </div>
              <div>
                <label htmlFor="non-yt-max" className="text-sm font-medium text-gray-400">
                  Non-YouTube
                </label>
                <input
                  id="non-yt-max"
                  type="number"
                  value={nonYtMax}
                  onChange={e => setNonYtMax(parseInt(e.target.value, 10))}
                  min="1"
                  className="w-full bg-gray-900 border border-gray-700 text-white rounded-md p-2 focus:ring-2 focus:ring-indigo-500 outline-none transition mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Maximum number of latest articles to fetch per feed.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end space-x-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isRefreshingAll}
            className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
          >
            {isRefreshingAll ? 'Refreshing...' : 'Start Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
};
