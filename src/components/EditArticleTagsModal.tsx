import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, TagIcon } from './icons';

export const EditArticleTagsModal: React.FC = () => {
  const { articleToEditTags, setArticleToEditTags, handleSaveArticleTags, allTags } =
    useAppContext();

  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [newTagInput, setNewTagInput] = useState('');

  const isOpen = !!articleToEditTags;
  const article = articleToEditTags;

  useEffect(() => {
    if (article && isOpen) {
      setNewTagInput('');
      // FIX: Explicitly cast `article.tags` to `string[]` to ensure correct type for Set constructor.
      setSelectedTags(new Set((article.tags as string[]) || []));
    }
  }, [article, isOpen]);

  const newCustomTags = useMemo(() => {
    const existingTagsSet = new Set(allTags);
    return Array.from(selectedTags)
      .filter(tag => !existingTagsSet.has(tag))
      .sort();
  }, [selectedTags, allTags]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      newSet.has(tag) ? newSet.delete(tag) : newSet.add(tag);
      return newSet;
    });
  };

  const handleAddNewTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tagToAdd = newTagInput.trim().toUpperCase();
    if (tagToAdd && !selectedTags.has(tagToAdd)) {
      handleToggleTag(tagToAdd);
    }
    setNewTagInput('');
  };

  const handleConfirm = () => {
    if (!article) return;
    handleSaveArticleTags(article.id, Array.from(selectedTags).sort());
    onClose();
  };

  const onClose = () => setArticleToEditTags(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !article) return null;

  const TagButton: React.FC<{ tag: string }> = ({ tag }) => (
    <button
      key={tag}
      onClick={() => handleToggleTag(tag)}
      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${selectedTags.has(tag) ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
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
            Edit Article Tags
          </h2>
          <p className="text-gray-400 mt-1 mb-6 truncate" title={article.title}>
            For: <span className="font-semibold text-gray-300">{article.title}</span>
          </p>
        </div>
        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          <div>
            {newCustomTags.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-400 mb-3">New Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {newCustomTags.map(tag => (
                    <TagButton key={tag} tag={tag} />
                  ))}
                </div>
              </div>
            )}
            {allTags.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-400 mb-3">Existing Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {allTags.map(tag => (
                    <TagButton key={tag} tag={tag} />
                  ))}
                </div>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Add New Tag</h3>
              <form onSubmit={handleAddNewTag} className="flex gap-2">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  placeholder="Type new tag and press Enter"
                  className="flex-grow bg-gray-900 border border-gray-700 text-white rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md text-white bg-gray-600 hover:bg-gray-500 font-semibold"
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-gray-700 flex-shrink-0 flex justify-end space-x-4">
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
            className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
