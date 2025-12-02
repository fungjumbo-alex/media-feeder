import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, SparklesIcon } from './icons';
import { TRANSLATION_LANGUAGES } from '../types';
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
        handleExecuteDetailedDigest,
        handleExecuteThematicDigest,
        defaultAiLanguage,
    } = useAppContext();

    const [eligibleArticles, setEligibleArticles] = useState<Article[]>([]);
    const [isCheckingTranscripts, setIsCheckingTranscripts] = useState(false);
    const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());
    const [targetLanguage, setTargetLanguage] = useState(defaultAiLanguage || 'original');
    
    const DETAILED_DIGEST_LIMIT = 10;
    const isThematicMode = articlesForDigest.length > DETAILED_DIGEST_LIMIT;

    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isDigestConfigModalOpen && modalRef.current) {
            const { innerWidth, innerHeight } = window;
            const { offsetWidth, offsetHeight } = modalRef.current;
            setPosition({
                x: (innerWidth - offsetWidth) / 2,
                y: (innerHeight - offsetHeight) / 2,
            });
        }
    }, [isDigestConfigModalOpen]);

    const handleMouseDown = (e: React.MouseEvent<HTMLElement>) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
        setIsDragging(true);
        document.body.style.cursor = 'grabbing';
        setDragStartOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        });
    };
    
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        setPosition({
            x: e.clientX - dragStartOffset.x,
            y: e.clientY - dragStartOffset.y,
        });
    }, [isDragging, dragStartOffset]);
    
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        document.body.style.cursor = 'default';
    }, []);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    useEffect(() => {
        if (isDigestConfigModalOpen) {
            setTargetLanguage(defaultAiLanguage || 'original');
            
            if (isThematicMode) {
                // Thematic mode uses all articles
                setEligibleArticles(articlesForDigest);
                setSelectedArticleIds(new Set(articlesForDigest.map(a => a.id)));
            } else {
                // Detailed mode: All articles are now eligible. The digest function will handle fallbacks.
                // Sort by date for initial selection.
                const sortedArticles = [...articlesForDigest].sort((a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0));
                setEligibleArticles(sortedArticles);
                // Pre-select up to the limit
                setSelectedArticleIds(new Set(sortedArticles.slice(0, DETAILED_DIGEST_LIMIT).map(a => a.id)));
            }
            
            // No need to check transcripts here anymore
            setIsCheckingTranscripts(false);
        }
    }, [isDigestConfigModalOpen, articlesForDigest, isThematicMode, defaultAiLanguage]);

    const onClose = () => setIsDigestConfigModalOpen(false);
    if (!isDigestConfigModalOpen) return null;

    const handleToggleSelection = (articleId: string) => {
        setSelectedArticleIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(articleId)) {
                newSet.delete(articleId);
            } else {
                if (newSet.size < DETAILED_DIGEST_LIMIT) {
                    newSet.add(articleId);
                }
            }
            return newSet;
        });
    };
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedArticleIds(new Set(eligibleArticles.slice(0, DETAILED_DIGEST_LIMIT).map(a => a.id)));
        } else {
            setSelectedArticleIds(new Set());
        }
    };

    const handleSubmit = () => {
        const selectedArticles = isThematicMode 
            ? articlesForDigest 
            : eligibleArticles.filter(a => selectedArticleIds.has(a.id));
            
        if (selectedArticles.length === 0) {
            alert("Please select at least one item to include in the digest.");
            return;
        }

        if (isThematicMode) {
            handleExecuteThematicDigest(selectedArticles, targetLanguage);
        } else {
            handleExecuteDetailedDigest(selectedArticles, targetLanguage);
        }
    };

    const isSelectionLimitReached = selectedArticleIds.size >= DETAILED_DIGEST_LIMIT;
    const isAllSelected = eligibleArticles.length > 0 && selectedArticleIds.size === Math.min(eligibleArticles.length, DETAILED_DIGEST_LIMIT);
    
    const renderContent = () => {
        if (isCheckingTranscripts) {
            return <LoadingState message={`Checking ${articlesForDigest.length} items for summarizable content...`} />;
        }
        
        if (eligibleArticles.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                    <p className="font-semibold">No Articles Selected</p>
                    <p className="text-xs mt-1">Please select one or more articles to create a digest.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col md:flex-row gap-6 p-6 flex-1 min-h-0">
                <div className="w-full md:w-2/3 flex flex-col min-h-0">
                    <h3 className="text-base font-semibold text-gray-200 mb-2 flex-shrink-0">
                        {isThematicMode ? 'Items for Thematic Digest' : '1. Select Items for Detailed Digest'}
                    </h3>
                    <p className="text-xs text-gray-400 mb-3 flex-shrink-0">
                        {isThematicMode
                            ? `Creating a thematic digest from all ${articlesForDigest.length} selected items.`
                            : `Select up to ${DETAILED_DIGEST_LIMIT} items for a detailed digest. The AI will use video transcripts when available.`}
                    </p>
                    <div className="border border-gray-700 rounded-md flex-grow flex flex-col min-h-0">
                        {!isThematicMode && (
                            <div className="flex items-center gap-3 px-3 py-2 bg-gray-900/50 border-b border-gray-700 flex-shrink-0">
                                <input id="select-all-digest" type="checkbox" checked={isAllSelected} onChange={handleSelectAll} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500" />
                                <label htmlFor="select-all-digest" className="text-sm font-semibold text-gray-300">Select All ({selectedArticleIds.size} / {Math.min(eligibleArticles.length, DETAILED_DIGEST_LIMIT)})</label>
                            </div>
                        )}
                        <div className="flex-grow overflow-y-auto p-2">
                            {(isThematicMode ? articlesForDigest : eligibleArticles).map(article => (
                                <div key={article.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700/50">
                                    {!isThematicMode && (
                                        <input
                                            id={`article-${article.id}`}
                                            type="checkbox"
                                            checked={selectedArticleIds.has(article.id)}
                                            onChange={() => handleToggleSelection(article.id)}
                                            disabled={!selectedArticleIds.has(article.id) && isSelectionLimitReached}
                                            className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500 flex-shrink-0 disabled:opacity-50"
                                        />
                                    )}
                                    <img src={article.imageUrl || ''} alt="" className="w-10 h-6 object-cover rounded bg-gray-700 flex-shrink-0" />
                                    <label htmlFor={`article-${article.id}`} className="text-sm text-gray-200 truncate flex-grow cursor-pointer" title={article.title}>{article.title}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="w-full md:w-1/3">
                     <h3 className="text-base font-semibold text-gray-200 mb-2">2. Select Language</h3>
                     <p className="text-xs text-gray-400 mb-3">Choose the language for the final summary. "Original" will use the content's source language.</p>
                     <div className="relative">
                        <select
                            value={targetLanguage}
                            onChange={(e) => setTargetLanguage(e.target.value)}
                            className="w-full bg-gray-700 text-white font-semibold py-2 pl-3 pr-8 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            {TRANSLATION_LANGUAGES.map(lang => (
                                <option key={lang.code} value={lang.code}>{lang.name}</option>
                            ))}
                        </select>
                         <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onMouseDown={(e) => {if(e.target === e.currentTarget) onClose()}}>
            <div
                ref={modalRef}
                className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] m-4 flex flex-col"
                style={{
                    position: 'absolute',
                    top: `${position.y}px`,
                    left: `${position.x}px`,
                }}
            >
                <header
                    onMouseDown={handleMouseDown}
                    className="p-4 border-b border-gray-700 flex-shrink-0 flex justify-between items-center"
                    style={{ cursor: isDragging ? 'grabbing' : 'move' }}
                >
                    <h2 className="text-xl font-bold text-white flex items-center">
                        <SparklesIcon className="w-6 h-6 mr-3 text-indigo-400" />
                        {isThematicMode ? 'Thematic Digest' : 'Detailed Digest'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><XIcon className="w-6 h-6" /></button>
                </header>
                <div className="flex-1 overflow-y-auto">
                    {renderContent()}
                </div>
                <footer className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800/50 flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={selectedArticleIds.size === 0 || isCheckingTranscripts}
                        className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
                    >
                        {isThematicMode ? 'Generate Thematic Digest' : 'Generate Detailed Digest'}
                    </button>
                </footer>
            </div>
        </div>
    );
};