import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, TrashIcon, AlertTriangleIcon } from './icons';

export const ClearDataModal: React.FC = () => {
    const { 
        isClearDataModalOpen, 
        setIsClearDataModalOpen, 
        handleClearArticlesAndHistory,
        handleFactoryReset
    } = useAppContext();

    if (!isClearDataModalOpen) return null;

    const onClose = () => setIsClearDataModalOpen(false);

    const onClearArticles = () => {
        handleClearArticlesAndHistory();
        onClose();
    };

    const onFactoryReset = () => {
        handleFactoryReset();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg m-4 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    <XIcon className="w-6 h-6" />
                </button>
                <div className="flex items-start mb-4">
                    <AlertTriangleIcon className="w-8 h-8 mr-4 text-yellow-400 flex-shrink-0" />
                    <div>
                        <h2 className="text-xl font-bold text-white">Clear Application Data</h2>
                        <p className="text-gray-400 mt-1">
                            Please choose an option below. This action cannot be undone.
                        </p>
                    </div>
                </div>
                
                <div className="space-y-4 mt-6">
                    <button
                        onClick={onClearArticles}
                        className="w-full flex flex-col items-start text-left p-4 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-indigo-500 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <TrashIcon className="w-5 h-5 text-gray-300" />
                            <span className="font-semibold text-gray-100">Clear Articles & History</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1 pl-8">
                            This will remove all downloaded articles, reading history, and your "Read Later" list. Your channel subscriptions and tags will be kept.
                        </p>
                    </button>

                    <button
                        onClick={onFactoryReset}
                        className="w-full flex flex-col items-start text-left p-4 rounded-lg bg-red-900/40 hover:bg-red-900/60 border border-red-500/50 hover:border-red-500 transition-colors"
                    >
                         <div className="flex items-center gap-3">
                            <TrashIcon className="w-5 h-5 text-red-400" />
                            <span className="font-semibold text-red-300">Clear Everything (Factory Reset)</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1 pl-8">
                            This will permanently delete all your subscriptions, articles, tags, and settings, returning the app to its original state.
                        </p>
                    </button>
                </div>

                <div className="mt-6 flex justify-end">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
