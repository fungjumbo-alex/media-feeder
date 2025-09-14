
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon } from './icons';

export const EditFeedModal: React.FC = () => {
    const { feedToEdit, setFeedToEdit, handleSaveFeedTitle, handleSaveFeedMaxArticles, setToast } = useAppContext();
    const [title, setTitle] = useState('');
    const [maxArticles, setMaxArticles] = useState(5);

    const isOpen = !!feedToEdit;
    const feed = feedToEdit;
    const onClose = () => setFeedToEdit(null);

    useEffect(() => {
        if (feed && isOpen) {
            setTitle(feed.title);
            setMaxArticles(feed.maxArticles || 5);
        }
    }, [feed, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value);

    const handleMaxArticlesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value > 0) {
            setMaxArticles(value);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!feed) return;

        let changed = false;
        if (title.trim() && title.trim() !== feed.title) {
            handleSaveFeedTitle(feed.id, title.trim());
            changed = true;
        }

        if (maxArticles !== (feed.maxArticles || 5)) {
            handleSaveFeedMaxArticles(feed.id, maxArticles);
            changed = true;
        }

        if (changed) {
            setToast({ message: "Feed settings saved.", type: 'success' });
        }

        onClose();
    };

    useEffect(() => {
        if (!isOpen) {
            setTimeout(() => {
                setTitle('');
                setMaxArticles(5);
            }, 200);
        }
    }, [isOpen]);

    if (!isOpen || !feed) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md m-4 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><XIcon className="w-6 h-6" /></button>
                <h2 className="text-xl font-bold text-white mb-2">Edit Feed</h2>
                <p className="text-gray-400 mb-6 truncate" title={feed.title}>Current: <span className="font-semibold text-gray-300">{feed.title}</span></p>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label htmlFor="feed-title-edit" className="text-sm font-medium text-gray-400">Title</label>
                        <input id="feed-title-edit" type="text" value={title} onChange={handleTitleChange} placeholder="Enter a new title" className="w-full bg-gray-900 border border-gray-700 text-white rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition mt-1" required autoFocus />
                    </div>
                    <div>
                        <label htmlFor="feed-max-articles" className="text-sm font-medium text-gray-400">Latest Articles to Download</label>
                        <input id="feed-max-articles" type="number" value={maxArticles} onChange={handleMaxArticlesChange} min="1" className="w-full bg-gray-900 border border-gray-700 text-white rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition mt-1" />
                        <p className="text-xs text-gray-500 mt-1">Number of recent articles to fetch per refresh. Default is 5.</p>
                    </div>

                    <div className="mt-6 flex justify-end space-x-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600">Cancel</button>
                        <button type="submit" className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
