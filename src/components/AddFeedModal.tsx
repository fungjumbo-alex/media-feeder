import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon } from './icons';

export const AddFeedModal: React.FC = () => {
    const { isAddFeedModalOpen, setAddFeedModalOpen, handleAddFeed, urlFromExtension, setUrlFromExtension, enableRssAndReddit } = useAppContext();
    const [url, setUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onClose = useCallback(() => {
        setAddFeedModalOpen(false);
        // After closing, ensure the extension URL is cleared so it doesn't pre-fill next time.
        if (urlFromExtension) {
            setUrlFromExtension(null);
        }
    }, [setAddFeedModalOpen, urlFromExtension, setUrlFromExtension]);

    useEffect(() => {
        if (isAddFeedModalOpen) {
            // When modal opens, pre-fill URL if it came from the extension, otherwise reset state.
            setUrl(urlFromExtension || '');
            setError(null);
            setIsAdding(false);
        }
    }, [isAddFeedModalOpen, urlFromExtension]);

    useEffect(() => {
        if (!isAddFeedModalOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAddFeedModalOpen, onClose]);

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(e.target.value);
        if (error) setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url || isAdding) return;

        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        const isBilibili = url.includes('bilibili.com');
        const isPastebin = url.includes('pastebin.com');
        const isShareCode = (/^[a-zA-Z0-9]+$/.test(url.trim()) && !url.includes('.')) || url.includes('#/import');
        const isPasteGG = url.includes('paste.gg/');
        const isAllowedWithoutSetting = isYouTube || isBilibili;

        if (!isAllowedWithoutSetting && !isPastebin && !isPasteGG && !isShareCode && !enableRssAndReddit) {
            setError("To add RSS or Reddit feeds, please enable them in the main settings menu (Actions & Settings > Settings).");
            return;
        }
        
        setIsAdding(true);
        setError(null);
        try {
            await handleAddFeed(url);
            onClose(); // Close modal on success
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred while adding the feed.");
        } finally {
            setIsAdding(false);
        }
    };

    if (!isAddFeedModalOpen) return null;

    const isImportingFromShare = isAdding && ((/^[a-zA-Z0-9]+$/.test(url.trim()) && !url.includes('.')) || url.includes('#/import') || url.includes('paste.gg/'));
    const isImportingFromPastebin = isAdding && url.includes('pastebin.com');

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md m-4 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><XIcon className="w-6 h-6" /></button>
                <h2 className="text-xl font-bold text-white mb-4">Follow a New Source</h2>
                <p className="text-gray-400 mb-6">Enter a feed URL, a YouTube/Bilibili/Reddit page, or a share link/code to import data.</p>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="feed-url" className="text-sm font-medium text-gray-400">Source URL, Link, or Code</label>
                            <input id="feed-url" type="text" value={url} onChange={handleUrlChange} placeholder="e.g., wired.com, .../#/import/qez7S, or qez7S" className="w-full bg-gray-900 border border-gray-700 text-white rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition mt-1" required autoFocus />
                        </div>
                    </div>
                    {error && <div className="mt-4 text-sm text-red-400 bg-red-900/40 p-3 rounded-md">{error}</div>}
                    <div className="mt-6 flex justify-end space-x-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600">Cancel</button>
                        <button type="submit" disabled={isAdding} className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed">
                            {isImportingFromShare ? 'Importing...' : isImportingFromPastebin ? 'Importing...' : isAdding ? 'Checking...' : 'Add Feed'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};