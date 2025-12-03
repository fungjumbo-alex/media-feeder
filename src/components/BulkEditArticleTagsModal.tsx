import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, TagIcon, TrashIcon } from './icons';

export const BulkEditArticleTagsModal: React.FC = () => {
  const {
    isBulkEditArticleTagsModalOpen,
    setIsBulkEditArticleTagsModalOpen,
    selectedArticleIdsForBatch,
    handleBulkSaveArticleTags,
    handleBulkClearArticleTags,
    allTags,
  } = useAppContext();

  const [editMode, setEditMode] = useState<'add' | 'set'>('add');
  const [tagsToApply, setTagsToApply] = useState<Set<string>>(new Set());
  const [newTagInput, setNewTagInput] = useState('');

  const isOpen = isBulkEditArticleTagsModalOpen;

  useEffect(() => {
    if (isOpen) {
      setEditMode('add');
      setTagsToApply(new Set());
      setNewTagInput('');
    }
  }, [isOpen]);

  const uniqueTags = useMemo(() => {
    const all = new Set([...allTags, ...Array.from(tagsToApply)]);
    return Array.from(all).sort();
  }, [allTags, tagsToApply]);

  const handleToggleTag = (tag: string) => {
    setTagsToApply(prev => {
      const newSet = new Set(prev);
      newSet.has(tag) ? newSet.delete(tag) : newSet.add(tag);
      return newSet;
    });
  };

  const handleAddNewTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tagToAdd = newTagInput.trim().toUpperCase();
    if (tagToAdd) {
      handleToggleTag(tagToAdd);
    }
    setNewTagInput('');
  };

  const handleConfirm = () => {
    if (selectedArticleIdsForBatch.size === 0) {
      alert('No articles selected.');
      return;
    }
    if (tagsToApply.size === 0) {
      alert('Please select at least one tag to apply.');
      return;
    }
    handleBulkSaveArticleTags(selectedArticleIdsForBatch, Array.from(tagsToApply), editMode);
    onClose();
  };

  const onClose = () => setIsBulkEditArticleTagsModalOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const TagButton: React.FC<{ tag: string }> = ({ tag }) => (
    <button
      key={tag}
      onClick={() => handleToggleTag(tag)}
      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${tagsToApply.has(tag) ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
    >
      {tag}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg m-4 relative flex flex-col max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <XIcon className="w-6 h-6" />
        </button>
        <div className="flex-shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TagIcon className="w-6 h-6 text-indigo-400" />
            Bulk Tag Articles
          </h2>
          <p className="text-gray-400 mt-1 mb-6">
            Applying tags to {selectedArticleIdsForBatch.size} selected article(s).
          </p>
        </div>
        <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-6">
          <div>
            <h3 className="text-base font-semibold text-gray-200 mb-2">1. Choose Action</h3>
            <div className="flex flex-col gap-2 bg-gray-900/50 p-2 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer p-1 rounded-md hover:bg-gray-700/50 transition-colors">
                <input
                  type="radio"
                  name="edit-mode"
                  value="add"
                  checked={editMode === 'add'}
                  onChange={() => setEditMode('add')}
                  className="h-4 w-4 text-indigo-600 bg-gray-700 border-gray-500 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium">Add Tags</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-1 rounded-md hover:bg-gray-700/50 transition-colors">
                <input
                  type="radio"
                  name="edit-mode"
                  value="set"
                  checked={editMode === 'set'}
                  onChange={() => setEditMode('set')}
                  className="h-4 w-4 text-indigo-600 bg-gray-700 border-gray-500 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium">Set (Overwrite) Tags</span>
              </label>
            </div>
            {editMode === 'set' && (
              <p className="mt-2 text-xs text-yellow-400/80">
                Warning: 'Set' will replace all existing tags on the selected articles.
              </p>
            )}
          </div>
          <div className="flex flex-col flex-grow min-h-0">
            <h3 className="text-base font-semibold text-gray-200 mb-2">2. Select & Add Tags</h3>
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
            <div className="border border-gray-700 rounded-md p-2 flex-grow overflow-y-auto min-h-[100px]">
              <div className="flex flex-wrap gap-2">
                {uniqueTags.length > 0 ? (
                  uniqueTags.map(tag => <TagButton key={tag} tag={tag} />)
                ) : (
                  <span className="text-xs text-gray-500 p-2">
                    No existing tags. Add one above.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-gray-700 flex-shrink-0 flex justify-between items-center">
          <button
            type="button"
            onClick={handleBulkClearArticleTags}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-500"
          >
            <TrashIcon className="w-4 h-4" />
            Clear All Tags
          </button>
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={tagsToApply.size === 0}
              className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
