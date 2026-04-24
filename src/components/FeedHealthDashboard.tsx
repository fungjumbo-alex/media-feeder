import React, { useState, useMemo } from 'react';
import type { Feed, Article } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { RssIcon, YouTubeIcon, TrashIcon } from './icons';

type HealthStatus = 'healthy' | 'stale' | 'dead';
type StatusFilter = 'all' | 'healthy' | 'stale' | 'dead';

interface FeedHealth {
  feed: Feed;
  status: HealthStatus;
  lastArticleAgo: string;
  articleCount: number;
  avgPerWeek: number;
  lastTimestamp: number | null;
}

const STATUS_ORDER: Record<HealthStatus, number> = {
  dead: 0,
  stale: 1,
  healthy: 2,
};

const STATUS_DOT: Record<HealthStatus, string> = {
  healthy: '🟢',
  stale: '🟡',
  dead: '🔴',
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  stale: 'Stale',
  dead: 'Dead',
};

function getTimeAgo(timestamp: number | null): string {
  if (timestamp === null) return 'Never';
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay > 0) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  if (diffHr > 0) return `${diffHr}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'Just now';
}

function computeHealth(feed: Feed): FeedHealth {
  const articles = feed.items || [];
  const articleCount = articles.length;

  const timestamps = articles
    .map((a: Article) => a.pubDateTimestamp)
    .filter((t): t is number => t !== null && t > 0)
    .sort((a: number, b: number) => b - a);

  const lastTimestamp = timestamps.length > 0 ? timestamps[0] : null;

  let avgPerWeek = 0;
  if (timestamps.length >= 2) {
    const newest = timestamps[0];
    const oldest = timestamps[timestamps.length - 1];
    const spanMs = newest - oldest;
    const spanDays = spanMs / (1000 * 60 * 60 * 24);
    if (spanDays > 0) {
      avgPerWeek = (timestamps.length / spanDays) * 7;
    }
  } else if (timestamps.length === 1) {
    avgPerWeek = 1;
  }

  const now = Date.now();
  let status: HealthStatus = 'dead';

  if (feed.error) {
    status = 'dead';
  } else if (lastTimestamp === null) {
    status = 'dead';
  } else {
    const diffDays = (now - lastTimestamp) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      status = 'healthy';
    } else if (diffDays <= 30) {
      status = 'stale';
    } else {
      status = 'dead';
    }
  }

  return {
    feed,
    status,
    lastArticleAgo: getTimeAgo(lastTimestamp),
    articleCount,
    avgPerWeek: Math.round(avgPerWeek * 10) / 10,
    lastTimestamp,
  };
}

const FilterPill: React.FC<{
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 text-sm font-semibold rounded-full transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`}
  >
    {label} ({count})
  </button>
);

const ConfirmModal: React.FC<{
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ count, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
      <h2 className="text-lg font-bold text-white mb-2">Remove Dead Feeds</h2>
      <p className="text-gray-300 mb-6">
        This will permanently unsubscribe from{' '}
        <span className="text-red-400 font-semibold">{count} dead feed{count !== 1 ? 's' : ''}</span>.
        This action cannot be undone.
      </p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm font-semibold rounded-md bg-red-600 text-white hover:bg-red-500 transition-colors"
        >
          Remove {count} Feed{count !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  </div>
);

export const FeedHealthDashboard: React.FC = () => {
  const { sortedFeeds, handleBulkDeleteFeeds, handleViewChange } = useAppContext();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortWorstFirst, setSortWorstFirst] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const allFeedHealths = useMemo(() => {
    return sortedFeeds.map(computeHealth);
  }, [sortedFeeds]);

  const counts = useMemo(() => {
    let healthy = 0;
    let stale = 0;
    let dead = 0;
    for (const fh of allFeedHealths) {
      if (fh.status === 'healthy') healthy++;
      else if (fh.status === 'stale') stale++;
      else dead++;
    }
    return { healthy, stale, dead };
  }, [allFeedHealths]);

  const filteredAndSorted = useMemo(() => {
    let list =
      statusFilter === 'all'
        ? allFeedHealths
        : allFeedHealths.filter(fh => fh.status === statusFilter);

    list = [...list].sort((a, b) => {
      const orderA = STATUS_ORDER[a.status];
      const orderB = STATUS_ORDER[b.status];
      if (sortWorstFirst) {
        if (orderA !== orderB) return orderA - orderB;
      } else {
        if (orderA !== orderB) return orderB - orderA;
      }
      // Within same status, sort by lastTimestamp ascending (oldest first when worst-first)
      const aTs = a.lastTimestamp || 0;
      const bTs = b.lastTimestamp || 0;
      return sortWorstFirst ? aTs - bTs : bTs - aTs;
    });

    return list;
  }, [allFeedHealths, statusFilter, sortWorstFirst]);

  const deadFeedIds = useMemo(() => {
    return new Set(allFeedHealths.filter(fh => fh.status === 'dead').map(fh => fh.feed.id));
  }, [allFeedHealths]);

  const handleRemoveDead = () => {
    if (deadFeedIds.size > 0) {
      handleBulkDeleteFeeds(deadFeedIds);
      setShowConfirmModal(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 p-4 sm:p-6 flex flex-col">
      <div className="max-w-6xl mx-auto w-full flex-grow flex flex-col">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6 flex-shrink-0">
          <div className="bg-gray-800 rounded-xl p-4 text-center border border-gray-700">
            <div className="text-3xl font-bold text-green-400">{counts.healthy}</div>
            <div className="text-sm text-gray-400 mt-1">🟢 Healthy</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center border border-gray-700">
            <div className="text-3xl font-bold text-yellow-400">{counts.stale}</div>
            <div className="text-sm text-gray-400 mt-1">🟡 Stale</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center border border-gray-700">
            <div className="text-3xl font-bold text-red-400">{counts.dead}</div>
            <div className="text-sm text-gray-400 mt-1">🔴 Dead</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <FilterPill
              label="All"
              count={allFeedHealths.length}
              active={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
            />
            <FilterPill
              label="Healthy"
              count={counts.healthy}
              active={statusFilter === 'healthy'}
              onClick={() => setStatusFilter('healthy')}
            />
            <FilterPill
              label="Stale"
              count={counts.stale}
              active={statusFilter === 'stale'}
              onClick={() => setStatusFilter('stale')}
            />
            <FilterPill
              label="Dead"
              count={counts.dead}
              active={statusFilter === 'dead'}
              onClick={() => setStatusFilter('dead')}
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setSortWorstFirst(prev => !prev)}
              className="px-3 py-1.5 text-sm font-semibold rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              {sortWorstFirst ? '↓ Worst First' : '↑ Best First'}
            </button>
            {counts.dead > 0 && (
              <button
                onClick={() => setShowConfirmModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
                Remove Dead Feeds
              </button>
            )}
            <button
              onClick={() => handleViewChange('all-subscriptions')}
              className="px-3 py-1.5 text-sm font-semibold rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Table Header */}
        <div className="hidden sm:grid grid-cols-[2fr_100px_120px_90px_90px_1fr] gap-2 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-700 flex-shrink-0">
          <span>Feed</span>
          <span className="text-center">Status</span>
          <span className="text-center">Last Article</span>
          <span className="text-center">Articles</span>
          <span className="text-center">Avg/wk</span>
          <span>Error</span>
        </div>

        {/* Feed Rows */}
        {filteredAndSorted.length === 0 ? (
          <div className="flex-grow flex items-center justify-center text-center text-gray-500 py-12">
            No feeds match this filter.
          </div>
        ) : (
          <div className="space-y-2 flex-grow py-2">
            {filteredAndSorted.map(fh => (
              <FeedHealthRow key={fh.feed.id} health={fh} />
            ))}
          </div>
        )}
      </div>

      {showConfirmModal && (
        <ConfirmModal
          count={deadFeedIds.size}
          onConfirm={handleRemoveDead}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
    </div>
  );
};

const FeedHealthRow: React.FC<{ health: FeedHealth }> = ({ health }) => {
  const { feed, status, lastArticleAgo, articleCount, avgPerWeek } = health;
  const [iconError, setIconError] = useState(false);
  const isYT = feed.url.toLowerCase().includes('youtube.com');

  const statusBgClass =
    status === 'healthy'
      ? 'bg-green-900/30'
      : status === 'stale'
        ? 'bg-yellow-900/30'
        : 'bg-red-900/30';

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-[2fr_100px_120px_90px_90px_1fr] gap-2 sm:gap-2 items-center px-4 py-3 rounded-lg ${statusBgClass} border border-gray-700/50 transition-colors`}
    >
      {/* Feed Name */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0">
          {feed.iconUrl && !iconError ? (
            <img
              src={feed.iconUrl}
              alt=""
              className="w-8 h-8 rounded-full bg-gray-700 object-cover"
              onError={() => setIconError(true)}
            />
          ) : isYT ? (
            <YouTubeIcon className="w-8 h-8 text-red-500" />
          ) : (
            <RssIcon className="w-8 h-8 text-gray-400" />
          )}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-gray-100 truncate" title={feed.title}>
            {feed.title}
          </div>
          {feed.tags && feed.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {feed.tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-400 rounded-full"
                >
                  {tag}
                </span>
              ))}
              {feed.tags.length > 3 && (
                <span className="text-[10px] text-gray-500">+{feed.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <span>{STATUS_DOT[status]}</span>
          <span
            className={`${
              status === 'healthy'
                ? 'text-green-400'
                : status === 'stale'
                  ? 'text-yellow-400'
                  : 'text-red-400'
            }`}
          >
            {STATUS_LABEL[status]}
          </span>
        </span>
      </div>

      {/* Last Article */}
      <div className="text-center text-sm text-gray-400">{lastArticleAgo}</div>

      {/* Article Count */}
      <div className="text-center text-sm text-gray-300 font-medium">{articleCount}</div>

      {/* Avg per week */}
      <div className="text-center text-sm text-gray-400">{avgPerWeek > 0 ? avgPerWeek : '—'}</div>

      {/* Error */}
      <div className="text-sm text-red-400 truncate" title={feed.error || ''}>
        {feed.error || <span className="text-gray-600">—</span>}
      </div>
    </div>
  );
};

export default FeedHealthDashboard;
