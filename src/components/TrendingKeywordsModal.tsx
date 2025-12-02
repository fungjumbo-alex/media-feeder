import React, { useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, TrendingUpIcon, RefreshIcon } from './icons';

const TrendingKeywordsModal: React.FC = () => {
    const {
        isTrendingKeywordsModalOpen,
        setIsTrendingKeywordsModalOpen,
        trendingKeywords,
        isGeneratingKeywords,
        keywordGenerationError,
        handleGenerateTrendingKeywords,
        handleViewChange,
    } = useAppContext();

    const isOpen = isTrendingKeywordsModalOpen;
    const onClose = () => setIsTrendingKeywordsModalOpen(false);

    useEffect(() => {
        if (isOpen) {
            // Fetch keywords if they are not available
            if (trendingKeywords.length === 0 && !isGeneratingKeywords) {
                handleGenerateTrendingKeywords();
            }
        }
    }, [isOpen, trendingKeywords, isGeneratingKeywords, handleGenerateTrendingKeywords]);

    if (!isOpen) return null;
    
    const handleKeywordClick = (keyword: string) => {
        handleViewChange('keyword-articles', keyword);
        onClose();
    };

    const renderContent = () => {
        if (isGeneratingKeywords && trendingKeywords.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-10">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                    <p className="font-semibold">Analyzing articles...</p>
                    <p className="text-xs">This may take a moment.</p>
                </div>
            );
        }

        if (keywordGenerationError && trendingKeywords.length === 0) {
            return (
                <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm my-4">
                    <p className="font-semibold mb-1">Error generating keywords:</p>
                    <p>{keywordGenerationError}</p>
                </div>
            );
        }

        if (trendingKeywords.length > 0) {
            return (
                <div className="grid grid-cols-2 gap-2">
                    {trendingKeywords.map(({ keyword, count }) => (
                        <button
                            key={keyword}
                            onClick={() => handleKeywordClick(keyword)}
                            className="w-full flex justify-between items-center px-3 py-2 rounded-md font-semibold transition-colors bg-gray-700 text-gray-200 hover:bg-indigo-600 group"
                        >
                            <span className="truncate">{keyword}</span>
                            <span className="flex-shrink-0 ml-4 text-xs font-normal bg-gray-600 rounded-full px-2 py-0.5 group-hover:bg-indigo-500 group-hover:text-white">
                                {count}
                            </span>
                        </button>
                    ))}
                </div>
            );
        }

        return (
            <div className="text-center text-gray-500 py-10">
                Not enough content from downloaded article titles to determine trending keywords. Add more feeds or refresh existing ones.
            </div>
        );
    };


    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg m-4 relative flex flex-col max-h-[90vh]">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    <XIcon className="w-6 h-6" />
                </button>
                <div className="flex items-center mb-4 flex-shrink-0">
                    <TrendingUpIcon className="w-8 h-8 mr-3 text-indigo-400" />
                    <h2 className="text-xl font-bold text-white">Trending Keywords</h2>
                </div>
                <p className="text-gray-400 mb-6 flex-shrink-0">
                    Top keywords from the titles of all your downloaded articles, sorted by relevance. Click a keyword to see related articles.
                </p>

                <div className="flex-grow flex flex-col min-h-0 overflow-y-auto pr-2 -mr-2">
                    {renderContent()}
                </div>
                <footer className="mt-6 flex justify-between items-center flex-shrink-0">
                    <button
                        onClick={() => handleGenerateTrendingKeywords(true)}
                        disabled={isGeneratingKeywords}
                        className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500 disabled:opacity-50"
                    >
                        <RefreshIcon className={`w-4 h-4 ${isGeneratingKeywords ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600">Close</button>
                </footer>
            </div>
        </div>
    );
};

export default TrendingKeywordsModal;