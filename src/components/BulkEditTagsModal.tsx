import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, TagsIcon, RssIcon, YouTubeIcon, StarIcon, TrashIcon } from './icons';

export const BulkEditTagsModal: React.FC = () => {
  const {
    bulkEditModalConfig,
    setBulkEditModalConfig,
    feeds,
    allTags,
    handleBulkUpdateTags,
    handleClearAllTags,
  } = useAppContext();
  const { isOpen, mode, tag: initialTag } = bulkEditModalConfig;

  const [selectedFeedIds, setSelectedFeedIds] = useState<Set<string>>(new Set());
  const [applyPrimaryFilter, setApplyPrimaryFilter] = useState(true);
  const [localEditMode, setLocalEditMode] = useState<'add' | 'set'>('add');
  const [tagsToApply, setTagsToApply] = useState<Set<string>>(new Set());
  const [newTagInput, setNewTagInput] = useState('');
  const [iconErrors, setIconErrors] = useState<Set<string>>(new Set());

  const uniqueTags = useMemo(() => {
    const all = new Set([...allTags, ...Array.from(tagsToApply)]);
    return Array.from(all).sort();
  }, [allTags, tagsToApply]);

  const handleIconError = (feedId: string) => {
    setIconErrors(prev => new Set(prev).add(feedId));
  };

  const onClose = () => {
    setBulkEditModalConfig({ isOpen: false, mode: 'add' });
  };

  const handleClearAllTagsClick = () => {
    handleClearAllTags();
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setIconErrors(new Set());
      setSelectedFeedIds(new Set());
      setApplyPrimaryFilter(true);
      setLocalEditMode('add');
      setNewTagInput('');

      if (mode === 'add' && initialTag) {
        setTagsToApply(new Set([initialTag]));
      } else {
        setTagsToApply(new Set());
      }
    }
  }, [isOpen, mode, initialTag]);

  const primaryFilterLabel = useMemo(() => {
    if (mode === 'favorite') return 'Only show non-favorited feeds';
    if (initialTag) return `Only show feeds missing the "${initialTag}" tag`;
    return 'Only show feeds without any tags';
  }, [mode, initialTag]);

  const filteredFeeds = useMemo(() => {
    const sortedFeeds = [...feeds].sort((a, b) => a.title.localeCompare(b.title));
    if (!applyPrimaryFilter) return sortedFeeds;

    if (mode === 'favorite') {
      return sortedFeeds.filter(feed => !feed.isFavorite);
    }
    if (initialTag) {
      return sortedFeeds.filter(feed => !feed.tags?.includes(initialTag));
    }
    return sortedFeeds.filter(feed => !feed.tags || feed.tags.length === 0);
  }, [feeds, applyPrimaryFilter, mode, initialTag]);

  useEffect(() => {
    const visibleFeedIds = new Set(filteredFeeds.map(f => f.id));
    setSelectedFeedIds(currentSelected => {
      const newSelection = new Set<string>();
      currentSelected.forEach(id => {
        if (visibleFeedIds.has(id)) newSelection.add(id);
      });
      return newSelection;
    });
  }, [filteredFeeds]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFeedIds(e.target.checked ? new Set(filteredFeeds.map(f => f.id)) : new Set());
  };

  const toggleFeedSelection = (feedId: string) => {
    setSelectedFeedIds(prev => {
      const newSet = new Set(prev);
      newSet.has(feedId) ? newSet.delete(feedId) : newSet.add(feedId);
      return newSet;
    });
  };

  const handleToggleTag = (tag: string) => {
    setTagsToApply(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) {
        newSet.delete(tag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  };

  const handleAddNewTag = (e: React.FormEvent) => {
    e.preventDefault();
    const newTag = newTagInput.trim().toUpperCase();
    if (newTag) {
      handleToggleTag(newTag);
      setNewTagInput('');
    }
  };

  const handleSubmit = () => {
    if (selectedFeedIds.size === 0) {
      alert('Please select at least one feed.');
      return;
    }

    if (mode === 'favorite') {
      handleBulkUpdateTags(selectedFeedIds, [], 'favorite');
    } else {
      if (tagsToApply.size === 0) {
        alert('Please select or add at least one tag to apply.');
        return;
      }
      handleBulkUpdateTags(selectedFeedIds, Array.from(tagsToApply), localEditMode);
    }
    onClose();
  };

  if (!isOpen) return null;

  const areAllVisibleSelected =
    filteredFeeds.length > 0 && selectedFeedIds.size === filteredFeeds.length;
  const modalTitle = mode === 'favorite' ? 'Add to Favorites' : 'Bulk Edit Tags';
  const ModalIcon = mode === 'favorite' ? StarIcon : TagsIcon;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl h-[90vh] m-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-700 flex-shrink-0 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center">
            <ModalIcon className="w-6 h-6 mr-3 text-indigo-400" />
            {modalTitle}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon className="w-6 h-6" />
          </button>
        </header>
        <div className="flex-grow p-6 flex flex-col md:flex-row gap-6 min-h-0">
          <div className="w-full md:w-1/2 flex flex-col">
            {/* Feed Selection */}
            <div className="flex-shrink-0 mb-4">
              <div className="flex items-center gap-3">
                <input
                  id="filter-feeds"
                  type="checkbox"
                  checked={applyPrimaryFilter}
                  onChange={() => setApplyPrimaryFilter(p => !p)}
                  className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="filter-feeds" className="text-sm text-gray-300">
                  {primaryFilterLabel}
                </label>
              </div>
            </div>
            <div className="border border-gray-700 rounded-md flex-grow flex flex-col min-h-0">
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-900/50 border-b border-gray-700 flex-shrink-0">
                <input
                  id="select-all"
                  type="checkbox"
                  checked={areAllVisibleSelected}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="select-all" className="text-sm font-semibold text-gray-300">
                  Select All ({selectedFeedIds.size} / {filteredFeeds.length})
                </label>
              </div>
              <div className="flex-grow overflow-y-auto p-2">
                {filteredFeeds.length > 0 ? (
                  filteredFeeds.map(feed => {
                    const isYouTubeFeed = feed.url.toLowerCase().includes('youtube.com');
                    return (
                      <div
                        key={feed.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700/50"
                      >
                        <input
                          id={`feed-${feed.id}`}
                          type="checkbox"
                          checked={selectedFeedIds.has(feed.id)}
                          onChange={() => toggleFeedSelection(feed.id)}
                          className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                        />
                        {feed.iconUrl && !iconErrors.has(feed.id) ? (
                          <img
                            src={feed.iconUrl}
                            alt=""
                            className="w-5 h-5 rounded-full flex-shrink-0 bg-gray-700 object-cover"
                            onError={() => handleIconError(feed.id)}
                          />
                        ) : isYouTubeFeed ? (
                          <YouTubeIcon className="w-5 h-5 flex-shrink-0 text-red-600" />
                        ) : (
                          <RssIcon className="w-5 h-5 flex-shrink-0 text-gray-400" />
                        )}
                        <label
                          htmlFor={`feed-${feed.id}`}
                          className="text-sm text-gray-200 truncate flex-grow cursor-pointer"
                          title={feed.title}
                        >
                          {feed.title}
                        </label>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-gray-500">No feeds match the filter.</div>
                )}
              </div>
            </div>
          </div>
          {/* Tag selection and summary panel */}
          <div className="w-full md:w-1/2 flex flex-col gap-4">
            {mode !== 'favorite' ? (
              <>
                <div className="flex flex-col gap-4 flex-grow min-h-0">
                  <div>
                    <h3 className="text-base font-semibold text-gray-200 mb-2">1. Choose Action</h3>
                    <div className="flex flex-col gap-2 bg-gray-900/50 p-2 rounded-lg">
                      <label className="flex items-center gap-2 cursor-pointer p-1 rounded-md hover:bg-gray-700/50 transition-colors">
                        <input
                          type="radio"
                          name="edit-mode"
                          value="add"
                          checked={localEditMode === 'add'}
                          onChange={() => setLocalEditMode('add')}
                          className="h-4 w-4 text-indigo-600 bg-gray-700 border-gray-500 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium">Add Tags</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-1 rounded-md hover:bg-gray-700/50 transition-colors">
                        <input
                          type="radio"
                          name="edit-mode"
                          value="set"
                          checked={localEditMode === 'set'}
                          onChange={() => setLocalEditMode('set')}
                          className="h-4 w-4 text-indigo-600 bg-gray-700 border-gray-500 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium">Set (Overwrite) Tags</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-col flex-grow min-h-0">
                    <h3 className="text-base font-semibold text-gray-200 mb-2">
                      2. Select & Add Tags
                    </h3>
                    <form onSubmit={handleAddNewTag} className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={newTagInput}
                        onChange={e => setNewTagInput(e.target.value)}
                        placeholder="Type a new tag..."
                        className="flex-grow bg-gray-900 border border-gray-700 text-white rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold text-sm"
                      >
                        Add
                      </button>
                    </form>
                    <div className="border border-gray-700 rounded-md p-2 flex-grow overflow-y-auto">
                      <div className="flex flex-wrap gap-2">
                        {uniqueTags.length > 0 ? (
                          uniqueTags.map(tag => (
                            <button
                              key={tag}
                              onClick={() => handleToggleTag(tag)}
                              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${tagsToApply.has(tag) ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
                            >
                              {tag}
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500 p-2">
                            No existing tags. Add one above.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-700/50 p-3 rounded-md text-sm text-gray-400 flex-shrink-0">
                  <p className="font-semibold text-gray-300">Summary:</p>
                  <p>
                    You will{' '}
                    <strong className="text-indigo-400">
                      {localEditMode === 'add' ? 'ADD' : 'SET'}
                    </strong>{' '}
                    {tagsToApply.size > 0 ? (
                      <>
                        the tag(s){' '}
                        <strong className="text-indigo-400">
                          {Array.from(tagsToApply).join(', ')}
                        </strong>
                      </>
                    ) : (
                      'tags'
                    )}{' '}
                    to <strong className="text-indigo-400">{selectedFeedIds.size}</strong> selected
                    feed(s).
                  </p>
                  {localEditMode === 'set' && (
                    <p className="mt-1 text-yellow-400/80">
                      Warning: 'Set' will replace all existing tags on the selected feeds.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-gray-700/50 p-3 rounded-md text-sm text-gray-400 h-full flex items-center justify-center">
                <p className="text-center">
                  You are about to <strong className="text-yellow-400">FAVORITE</strong>{' '}
                  <strong className="text-yellow-400">{selectedFeedIds.size}</strong> selected
                  feed(s).
                </p>
              </div>
            )}
          </div>
        </div>
        <footer className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800/80 flex justify-between items-center">
          <button
            type="button"
            onClick={handleClearAllTagsClick}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-500"
          >
            <TrashIcon className="w-4 h-4" />
            Remove All Tags
          </button>
          <div className="flex gap-4">
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
              disabled={
                selectedFeedIds.size === 0 || (mode !== 'favorite' && tagsToApply.size === 0)
              }
              className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
            >
              Apply Changes
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
