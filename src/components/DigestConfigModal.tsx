import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, SparklesIcon } from './icons';
import { fetchAvailableCaptionChoices } from '../services/geminiService';
import { getYouTubeId } from '../services/youtubeService';
import type { Article } from '../types';

const LoadingState: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="font-semibold">{message}</p>
        <p className="text-xs">This may take a moment...</p>
    </div>
);

export const DigestConfigModal: React.FC = () => {
    const { 
        isDigestConfigModalOpen, 
        setIsDigestConfigModalOpen, 
        articlesForDigest, 
        handleExecuteDigest 
    } = useAppContext();

    const [eligibleArticles, setEligibleArticles] = useState<Article[]>([]);
    const [isCheckingTranscripts, setIsCheckingTranscripts] = useState(false);
    const [checkingProgress, setCheckingProgress] = useState(0);
    const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());
    const [targetLanguage, setTargetLanguage] = useState('original');
    
    const MAX_SELECTION_LIMIT = 10;

    useEffect(() => {
        if (isDigestConfigModalOpen) {
            setEligibleArticles([]);
            setSelectedArticleIds(new Set());
            setTargetLanguage('original');
            setCheckingProgress(0);
            
            const checkTranscripts = async () => {
                setIsCheckingTranscripts(true);
                
                const articlesToCheck = articlesForDigest; // Check all selected articles
                const totalArticles = articlesToCheck.length;
                let processedCount = 0;

                const checkPromises = articlesToCheck.map(article => {
                    const videoId = getYouTubeId(article.link);
                    if (!videoId) {
                        // Immediately update progress for non-video/invalid articles
                        processedCount++;
                        setCheckingProgress((processedCount / totalArticles) * 100);
                        return Promise.resolve(null);
                    }

                    return fetchAvailableCaptionChoices(videoId)
                        .then(choices => {
                            processedCount++;
                            setCheckingProgress((processedCount / totalArticles) * 100);
                            return choices.length > 0 ? article : null;
                        })
                        .catch(e => {
                            console.warn(`Could not check transcript for ${article.title}:`, e);
                            processedCount++;
                            setCheckingProgress((processedCount / totalArticles) * 100);
                            return null; // Don't fail the whole batch
                        });
                });

                const results = await Promise.all(checkPromises);
                const articlesWithTranscripts = results.filter((a): a is Article => a !== null);

                setEligibleArticles(articlesWithTranscripts);
                setSelectedArticleIds(new Set(articlesWithTranscripts.slice(0, MAX_SELECTION_LIMIT).map(a => a.id)));
                setIsCheckingTranscripts(false);
            };

            checkTranscripts();
        }
    }, [isDigestConfigModalOpen, articlesForDigest]);

    const onClose = () => setIsDigestConfigModalOpen(false);
    if (!isDigestConfigModalOpen) return null;

    const handleToggleSelection = (articleId: string) => {
        setSelectedArticleIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(articleId)) {
                newSet.delete(articleId);
            } else {
                if (newSet.size < MAX_SELECTION_LIMIT) {
                    newSet.add(articleId);
                }
            }
            return newSet;
        });
    };
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedArticleIds(new Set(eligibleArticles.slice(0, MAX_SELECTION_LIMIT).map(a => a.id)));
        } else {
            setSelectedArticleIds(new Set());
        }
    };

    const handleSubmit = () => {
        const selectedArticles = eligibleArticles.filter(a => selectedArticleIds.has(a.id));
        if (selectedArticles.length === 0) {
            alert("Please select at least one video to include in the digest.");
            return;
        }
        handleExecuteDigest(selectedArticles, targetLanguage);
    };

    const isSelectionLimitReached = selectedArticleIds.size >= MAX_SELECTION_LIMIT;
    const isAllSelected = eligibleArticles.length > 0 && selectedArticleIds.size === Math.min(eligibleArticles.length, MAX_SELECTION_LIMIT);

    const languages = [
        { code: 'original', name: 'Original Language' },
        { code: 'English', name: 'English' },
        { code: 'Traditional Chinese', name: '繁體中文 (Traditional)' },
        { code: 'Simplified Chinese', name: '简体中文 (Simplified)' },
    ];
    
    const renderContent = () => {
        if (isCheckingTranscripts) {
            return <LoadingState message={`Checking ${articlesForDigest.length} videos for transcripts... (${Math.round(checkingProgress)}%)`} />;
        }
        
        if (eligibleArticles.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                    <p className="font-semibold">No Videos with Transcripts Found</p>
                    <p className="text-xs mt-1">Could not find any videos with available transcripts in the current view.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col md:flex-row gap-6 p-6 flex-1 min-h-0">
                <div className="w-full md:w-2/3 flex flex-col min-h-0">
                    <h3 className="text-base font-semibold text-gray-200 mb-2 flex-shrink-0">1. Select Videos for Digest</h3>
                    <p className="text-xs text-gray-400 mb-3 flex-shrink-0">
                        Found {eligibleArticles.length} videos with transcripts. You can select up to {MAX_SELECTION_LIMIT} to include.
                    </p>
                    <div className="border border-gray-700 rounded-md flex-1 flex flex-col min-h-0">
                        <div className="flex items-center gap-3 px-3 py-2 bg-gray-900/50 border-b border-gray-700 flex-shrink-0">
                            <input id="select-all-digest" type="checkbox" checked={isAllSelected} onChange={handleSelectAll} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500" />
                            <label htmlFor="select-all-digest" className="text-sm font-semibold text-gray-300">
                                Select First {Math.min(eligibleArticles.length, MAX_SELECTION_LIMIT)} ({selectedArticleIds.size} / {MAX_SELECTION_LIMIT})
                            </label>
                            {isSelectionLimitReached && <span className="ml-auto text-xs font-medium text-yellow-400">Limit reached</span>}
                        </div>
                        <div className="overflow-y-auto p-2">
                            {eligibleArticles.map(article => {
                                const isSelected = selectedArticleIds.has(article.id);
                                const isDisabled = !isSelected && isSelectionLimitReached;
                                return (
                                    <div 
                                        key={article.id} 
                                        onClick={() => !isDisabled && handleToggleSelection(article.id)} 
                                        className={`flex items-center gap-3 p-2 rounded-md transition-opacity ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700/50 cursor-pointer'}`}
                                    >
                                        <input 
                                            type="checkbox" 
                                            checked={isSelected} 
                                            readOnly 
                                            disabled={isDisabled}
                                            className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500 pointer-events-none flex-shrink-0" />
                                        <img src={article.imageUrl || ''} alt="" className="w-16 h-9 object-cover rounded bg-gray-700 flex-shrink-0" />
                                        <div className="flex-grow min-w-0">
                                            <p className="text-sm text-gray-200 truncate" title={article.title}>{article.title}</p>
                                            <p className="text-xs text-gray-500 truncate">{article.feedTitle}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                
                <div className="w-full md:w-1/3 flex flex-col gap-4">
                    <div>
                        <h3 className="text-base font-semibold text-gray-200 mb-2">2. Select Output Language</h3>
                        <select 
                            value={targetLanguage} 
                            onChange={(e) => setTargetLanguage(e.target.value)} 
                            className="w-full bg-gray-700 text-white font-semibold py-2 pl-3 pr-8 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            {languages.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                        </select>
                    </div>
                    <div className="mt-auto pt-4 space-y-2">
                         <div className="bg-gray-700/50 p-3 rounded-md text-xs text-gray-400 flex-shrink-0">
                            <p className="font-semibold text-gray-300">Summary:</p>
                            <p>Generate a digest from <strong className="text-indigo-400">{selectedArticleIds.size}</strong> selected video(s) in <strong className="text-indigo-400">{languages.find(l => l.code === targetLanguage)?.name}</strong>.</p>
                        </div>
                        <button 
                            onClick={handleSubmit} 
                            disabled={selectedArticleIds.size === 0} 
                            className="w-full flex items-center justify-center px-4 py-2.5 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
                        >
                            <SparklesIcon className="w-5 h-5 mr-2"/>
                            Generate Digest
                        </button>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl h-[90vh] m-4 flex flex-col">
                <header className="p-4 border-b border-gray-700 flex-shrink-0 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center">
                        <SparklesIcon className="w-6 h-6 mr-3 text-indigo-400" />Configure AI Digest
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><XIcon className="w-6 h-6" /></button>
                </header>
                
                <div className="flex-1 min-h-0">
                    {renderContent()}
                </div>

                 <footer className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800/80 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600">Cancel</button>
                </footer>
            </div>
        </div>
    );
};