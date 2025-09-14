
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import type { RecommendedFeed } from '../types';
import { XIcon, SparklesIcon, PlusIcon, CheckCircleIcon } from './icons';

const LoadingSpinner: React.FC = () => (
    <div className="flex flex-col justify-center items-center h-full text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-lg text-gray-300">Finding new feeds for you...</p>
        <p className="text-sm text-gray-500">The AI is analyzing your subscriptions.</p>
    </div>
);
const ErrorDisplay: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
    <div className="flex flex-col justify-center items-center h-full">
        <div className="bg-red-500/10 text-red-400 p-4 rounded-lg m-4 text-center"><p className="font-semibold">An error occurred:</p><p>{message}</p></div>
        <button onClick={onRetry} className="mt-4 px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500">Start Over</button>
    </div>
);

export const RecommendationsModal: React.FC = () => {
    const { isRecommendationsModalOpen, setIsRecommendationsModalOpen, recommendationsState, handleGenerateRecommendations, handleAddFromRecommendation, feeds, handleResetRecommendations, handleGenerateMoreRecommendations } = useAppContext();
    const { recommendations, isLoading, error } = recommendationsState;
    const [addingStates, setAddingStates] = useState<Record<string, 'idle' | 'adding' | 'error'>>({});
    const [customQuery, setCustomQuery] = useState('');

    const isOpen = isRecommendationsModalOpen;
    const onClose = () => setIsRecommendationsModalOpen(false);
    const existingFeedUrls = useMemo(() => new Set(feeds.map(f => f.url)), [feeds]);

    useEffect(() => {
        if (isOpen) {
            setAddingStates({});
        } else {
            // Reset local state when modal closes
            setCustomQuery('');
        }
    }, [isOpen]);

    const handleAdd = (rec: RecommendedFeed) => {
        setAddingStates(prev => ({ ...prev, [rec.url]: 'adding' }));
        handleAddFromRecommendation(rec.url, rec.title).catch(e => {
            console.error("Failed to add feed from recommendations:", e);
            setAddingStates(prev => ({ ...prev, [rec.url]: 'error' }));
        });
    };
    
    const recommendationsToShow = useMemo(() => {
        if (!recommendations) return [];
        return recommendations.filter(rec => { try { new URL(rec.url); return true; } catch { return false; } });
    }, [recommendations]);

    if (!isOpen) return null;

    const renderContent = () => {
        if (isLoading && !recommendations) return <LoadingSpinner />;
        if (error && !recommendations) return <ErrorDisplay message={error} onRetry={() => { handleResetRecommendations(); setCustomQuery(''); }} />;
        if (!recommendations) {
            return (
                <div className="text-center flex flex-col items-center justify-center h-full px-4">
                    <SparklesIcon className="w-16 h-16 text-indigo-400 mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Discover New Feeds</h3>
                    <p className="text-gray-400 mb-4 max-w-lg">Let our AI analyze your subscriptions and reading history to recommend new sources. You can add specific requirements below.</p>
                    <textarea
                        value={customQuery}
                        onChange={(e) => setCustomQuery(e.target.value)}
                        placeholder="e.g., 'podcasts about startups' or 'tech blogs with a focus on privacy'"
                        className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-md p-3 text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none mb-6"
                        rows={2}
                    />
                    <button onClick={() => handleGenerateRecommendations(customQuery)} disabled={isLoading} className="flex items-center px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"><SparklesIcon className="w-5 h-5 mr-2" />Generate Recommendations</button>
                </div>
            );
        }
        if (recommendationsToShow.length === 0 && !isLoading) {
            return (
                <div className="text-center text-gray-400 p-8 flex flex-col items-center justify-center h-full">
                    <p>The AI couldn't find any new recommendations right now.</p>
                    <p className="text-sm text-gray-500 mt-1">Try again later or adjust your requirements.</p>
                    <button onClick={() => { handleResetRecommendations(); setCustomQuery(''); }} className="mt-6 px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500">
                        Start Over
                    </button>
                </div>
            );
        }
        return (
            <div className="flex flex-col h-full">
                <div className="flex-grow overflow-y-auto space-y-4">
                    {recommendationsToShow.map(rec => {
                        const isAdded = existingFeedUrls.has(rec.url);
                        const statusInFlight = addingStates[rec.url];
                        return (
                            <div key={rec.url} className="bg-gray-700/50 rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start">
                                <div className="flex-grow">
                                    <h4 className="font-bold text-lg text-gray-100">{rec.title}</h4>
                                    <p className="text-sm text-gray-400 mt-1 italic">"{rec.reason}"</p>
                                    <p className="text-xs text-gray-500 mt-2 truncate">{rec.url}</p>
                                </div>
                                <div className="flex-shrink-0 w-full sm:w-auto">
                                    {isAdded ? <button disabled className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md bg-green-600/30 text-green-400 font-semibold"><CheckCircleIcon className="w-5 h-5 mr-2" /> Added</button>
                                    : statusInFlight === 'adding' ? <button disabled className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md bg-indigo-400/50 text-white font-semibold cursor-wait"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Adding...</button>
                                    : statusInFlight === 'error' ? <button onClick={() => handleAdd(rec)} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-500">Error! Retry</button>
                                    : <button onClick={() => handleAdd(rec)} className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500"><PlusIcon className="w-5 h-5 mr-2" /> Add</button>}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="pt-4 mt-2 border-t border-gray-700/50 flex flex-col items-center gap-2 flex-shrink-0">
                    <button 
                        onClick={() => handleGenerateMoreRecommendations(customQuery)} 
                        disabled={isLoading}
                        className="w-full sm:w-auto flex items-center justify-center px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
                    >
                        <SparklesIcon className={`w-5 h-5 mr-2 ${isLoading ? 'animate-pulse' : ''}`} />
                        {isLoading ? 'Searching...' : 'Find More Suggestions'}
                    </button>
                    <button 
                        onClick={() => { handleResetRecommendations(); setCustomQuery(''); }}
                        disabled={isLoading}
                        className="text-gray-400 hover:text-gray-200 text-xs font-semibold disabled:opacity-50"
                    >
                        Start a new search
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl h-[90vh] m-4 flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex-shrink-0 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center"><SparklesIcon className="w-6 h-6 mr-3 text-indigo-400" />Feed Recommendations</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><XIcon className="w-6 h-6" /></button>
                </header>
                <div className="p-6 flex-1 overflow-y-auto min-h-0">{renderContent()}</div>
            </div>
        </div>
    );
};
