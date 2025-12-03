import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, BookOpenIcon } from './icons';

export const EpubSettingsModal: React.FC = () => {
  const {
    isEpubSettingsModalOpen,
    setIsEpubSettingsModalOpen,
    epubDefaults,
    handleConfirmGenerateEbook,
  } = useAppContext();

  const [title, setTitle] = useState('');
  const [filename, setFilename] = useState('');

  useEffect(() => {
    if (isEpubSettingsModalOpen && epubDefaults) {
      setTitle(epubDefaults.title);
      setFilename(epubDefaults.filename);
    }
  }, [isEpubSettingsModalOpen, epubDefaults]);

  const isOpen = isEpubSettingsModalOpen;
  const onClose = () => setIsEpubSettingsModalOpen(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && filename.trim()) {
      handleConfirmGenerateEbook(title.trim(), filename.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg m-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <XIcon className="w-6 h-6" />
        </button>
        <div className="flex items-center mb-4">
          <BookOpenIcon className="w-6 h-6 mr-3 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">EPUB Settings</h2>
        </div>
        <p className="text-gray-400 mb-6">Confirm the title and filename for your EPUB export.</p>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="epub-title" className="text-sm font-medium text-gray-400">
                Book Title
              </label>
              <input
                id="epub-title"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-md p-2 focus:ring-2 focus:ring-indigo-500 outline-none transition mt-1"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                This will be the title inside the EPUB file's metadata.
              </p>
            </div>
            <div>
              <label htmlFor="epub-filename" className="text-sm font-medium text-gray-400">
                File Name
              </label>
              <div className="flex items-center mt-1">
                <input
                  id="epub-filename"
                  type="text"
                  value={filename}
                  onChange={e => setFilename(e.target.value.replace(/\.epub$/, ''))}
                  className="w-full bg-gray-900 border border-gray-700 text-white rounded-l-md p-2 focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  required
                />
                <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-700 bg-gray-700 text-gray-400 text-sm">
                  .epub
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                This will be the name of the downloaded file.
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
              type="submit"
              className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
            >
              Generate EPUB
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
