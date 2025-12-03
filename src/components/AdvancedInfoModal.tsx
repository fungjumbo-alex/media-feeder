import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, BarChartIcon, DatabaseIcon, TrashIcon, YouTubeIcon, RssIcon } from './icons';
import type { FeedType } from '../types';

const ProxyTypeStats: React.FC<{
  type: FeedType;
  proxyName: string;
  stats: { success: number; failure: number };
  isDisabled: boolean;
  onToggle: () => void;
}> = ({ type, proxyName, stats, isDisabled, onToggle }) => {
  const total = stats.success + stats.failure;
  const successRate = total > 0 ? (stats.success / total) * 100 : 0;
  const Icon = type === 'youtube' ? YouTubeIcon : RssIcon;

  return (
    <div className={`transition-opacity ${isDisabled ? 'opacity-50' : ''}`}>
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-2">
          <Icon
            className={`w-5 h-5 flex-shrink-0 ${type === 'youtube' ? 'text-red-500' : 'text-orange-400'}`}
          />
          <h4 className="font-semibold text-gray-300 capitalize text-sm">{type} Feeds</h4>
        </div>
        <label
          htmlFor={`${type}-toggle-${proxyName}`}
          className="relative inline-flex items-center cursor-pointer"
          title={isDisabled ? `Enable for ${type}` : `Disable for ${type}`}
        >
          <input
            type="checkbox"
            id={`${type}-toggle-${proxyName}`}
            className="sr-only peer"
            checked={!isDisabled}
            onChange={onToggle}
          />
          <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
      </div>
      <div className="w-full bg-gray-600 rounded-full h-2.5">
        <div
          className="bg-green-500 h-2.5 rounded-full"
          style={{ width: `${successRate}%` }}
          title={`Success Rate: ${successRate.toFixed(1)}%`}
        ></div>
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1.5">
        <span>
          Success: <span className="text-green-400 font-medium">{stats.success}</span>
        </span>
        <span>
          Failures: <span className="text-red-400 font-medium">{stats.failure}</span>
        </span>
        <span>
          Total: <span className="text-gray-200 font-medium">{total}</span>
        </span>
      </div>
    </div>
  );
};

const NetworkTabContent: React.FC = () => {
  const {
    proxyStats,
    handleClearProxyStats,
    disabledProxies,
    handleToggleProxy,
    refreshBatchSize,
    setRefreshBatchSize,
    refreshDelaySeconds,
    setRefreshDelaySeconds,
  } = useAppContext();

  const statsArray = Object.entries(proxyStats)
    .map(([name, data]) => {
      const typedData = data as {
        rss?: { success: number; failure: number };
        youtube?: { success: number; failure: number };
      };
      const total =
        (typedData.rss?.success || 0) +
        (typedData.rss?.failure || 0) +
        (typedData.youtube?.success || 0) +
        (typedData.youtube?.failure || 0);
      return { name, ...typedData, total };
    })
    .sort((a, b) => b.total - a.total);

  const handleClear = () => {
    if (
      window.confirm(
        'Are you sure you want to clear all network statistics? This cannot be undone.'
      )
    ) {
      handleClearProxyStats();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">
        This tracks the success and failure rates for the CORS proxy services used to fetch feeds.
        <span className="block mt-1 font-semibold text-indigo-400">
          The app automatically prioritizes proxies with higher success rates for each feed type.
        </span>
        You can also manually disable a proxy for a specific feed type if it is consistently
        failing.
      </p>
      <div className="bg-gray-700/50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-100 text-lg mb-3">Refresh Throttling</h3>
        <p className="text-xs text-gray-400 mb-4">
          To avoid being rate-limited, the app refreshes feeds in batches. You can configure the
          size of each batch and the delay between them.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="batch-size" className="block text-sm font-medium text-gray-300 mb-1">
              Batch Size
            </label>
            <input
              type="number"
              id="batch-size"
              value={refreshBatchSize}
              onChange={e => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val > 0) setRefreshBatchSize(val);
              }}
              className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              min="1"
            />
            <p className="text-xs text-gray-500 mt-1">Number of feeds per batch.</p>
          </div>
          <div>
            <label htmlFor="delay-seconds" className="block text-sm font-medium text-gray-300 mb-1">
              Delay (seconds)
            </label>
            <input
              type="number"
              id="delay-seconds"
              value={refreshDelaySeconds}
              onChange={e => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 0) setRefreshDelaySeconds(val);
              }}
              className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              min="0"
            />
            <p className="text-xs text-gray-500 mt-1">Wait time between batches.</p>
          </div>
        </div>
      </div>

      {statsArray.length > 0 ? (
        statsArray.map(stat => (
          <div key={stat.name} className="bg-gray-700/50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-100 text-lg mb-3">{stat.name}</h3>
            <div className="space-y-4">
              <ProxyTypeStats
                type="rss"
                proxyName={stat.name}
                stats={stat.rss || { success: 0, failure: 0 }}
                isDisabled={disabledProxies.has(`${stat.name}_rss`)}
                onToggle={() => handleToggleProxy(stat.name, 'rss')}
              />
              <ProxyTypeStats
                type="youtube"
                proxyName={stat.name}
                stats={stat.youtube || { success: 0, failure: 0 }}
                isDisabled={disabledProxies.has(`${stat.name}_youtube`)}
                onToggle={() => handleToggleProxy(stat.name, 'youtube')}
              />
            </div>
          </div>
        ))
      ) : (
        <div className="text-center text-gray-500 py-8">
          No network statistics have been recorded yet. Refresh some feeds to begin.
        </div>
      )}
      <div className="pt-4 mt-2 border-t border-gray-700 flex justify-start">
        <button
          onClick={handleClear}
          disabled={statsArray.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-500 disabled:bg-red-400/50 disabled:cursor-not-allowed"
        >
          <TrashIcon className="w-4 h-4" />
          Clear Statistics
        </button>
      </div>
    </div>
  );
};

const StorageTabContent: React.FC = () => {
  const { calculateStorageSize, handleClearArticlesCache } = useAppContext();
  const [cacheSize, setCacheSize] = useState('Calculating...');

  useEffect(() => {
    setCacheSize(calculateStorageSize());
  }, [calculateStorageSize]);

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

  return (
    <div className="space-y-4">
      <p className="text-gray-400 mb-6 text-sm">
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
    </div>
  );
};

export const AdvancedInfoModal: React.FC = () => {
  const { isAdvancedInfoModalOpen, setIsAdvancedInfoModalOpen } = useAppContext();
  const [activeTab, setActiveTab] = useState<'network' | 'storage'>('network');

  const isOpen = isAdvancedInfoModalOpen;
  const onClose = () => setIsAdvancedInfoModalOpen(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg m-4 relative flex flex-col max-h-[90vh]">
        <header className="flex-shrink-0 flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChartIcon className="w-6 h-6 text-indigo-400" />
            Stats & Storage
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-shrink-0 border-b border-gray-700 mb-4">
          <nav className="flex space-x-4">
            <button
              onClick={() => setActiveTab('network')}
              className={`px-3 py-2 font-medium text-sm rounded-t-lg transition-colors ${activeTab === 'network' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <div className="flex items-center gap-2">
                <BarChartIcon className="w-5 h-5" /> Network
              </div>
            </button>
            <button
              onClick={() => setActiveTab('storage')}
              className={`px-3 py-2 font-medium text-sm rounded-t-lg transition-colors ${activeTab === 'storage' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <div className="flex items-center gap-2">
                <DatabaseIcon className="w-5 h-5" /> Storage
              </div>
            </button>
          </nav>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          {activeTab === 'network' ? <NetworkTabContent /> : <StorageTabContent />}
        </div>

        <footer className="mt-6 pt-4 border-t border-gray-700 flex-shrink-0 flex justify-end">
          <button
            type="button"
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
