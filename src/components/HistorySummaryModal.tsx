
import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, SparklesIcon } from './icons';
import type { HistoryDigest, WebSource } from '../types';

const LoadingSpinner: React.FC<{ message: string | null }> = ({ message }) => (
    <div className="flex flex-col justify-center items-center h-full text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-lg text-gray-300">{message || 'Analyzing your current view...'}</p>
        <p className="text-sm text-gray-500">This may take a moment.</p>
    </div>
);
const ErrorDisplay: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex justify-center items-center h-full">
        <div className="bg-red-500/10 text-red-400 p-4 rounded-lg m-4 text-center">
            <p className="font-semibold">An error occurred:</p><p>{message}</p>
        </div>
    </div>
);

const LanguageSelector: React.FC<{
    selectedLanguage: string;
    onLanguageChange: (lang: string) => void;
    isTranslating: boolean;
}> = ({ selectedLanguage, onLanguageChange, isTranslating }) => {
    const languages = [
        { code: 'original', name: 'Original Language' },
        { code: 'English', name: 'English' },
        { code: 'Traditional Chinese', name: '繁體中文 (Traditional)' },
        { code: 'Simplified Chinese', name: '简体中文 (Simplified)' },
    ];

    return (
        <div className="relative">
            <select
                value={selectedLanguage}
                onChange={(e) => onLanguageChange(e.target.value)}
                disabled={isTranslating}
                className="bg-gray-700 text-white font-semibold py-2 pl-3 pr-8 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-70"
                aria-label="Select translation language"
            >
                {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
        </div>
    );
};

const SynthesisRenderer: React.FC<{ synthesis: string; sources: WebSource[] }> = ({ synthesis, sources }) => {
    const handleCitationClick = (e: React.MouseEvent<HTMLAnchorElement>, anchor: string) => {
        e.preventDefault();
        const targetElement = document.querySelector(anchor);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.classList.add('highlight-source');
            setTimeout(() => targetElement.classList.remove('highlight-source'), 1500);
        }
    };

    const renderTextWithCitations = (text: string) => {
        const parts = text.split(/(\[\d+\])/g).filter(part => part);
        return parts.map((part, index) => {
            const match = part.match(/\[(\d+)\]/);
            if (match) {
                const number = parseInt(match[1], 10);
                const source = sources[number - 1];
                if (source) {
                    return (
                        <a
                            key={index}
                            href={`#source-${number}`}
                            onClick={(e) => handleCitationClick(e, `#source-${number}`)}
                            title={source.title}
                            className="relative inline-block align-super text-xs font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/20 rounded-sm px-1 py-0.5 -top-1 mx-0.5 no-underline transition-colors"
                        >
                            {number}
                        </a>
                    );
                }
            }
            return <React.Fragment key={index}>{part}</React.Fragment>;
        });
    };

    const lines = synthesis.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();

        if (line.startsWith('# ')) {
            elements.push(<h2 key={i} className="text-2xl font-bold text-white mt-6 mb-3">{renderTextWithCitations(line.substring(2))}</h2>);
            i++;
        } else if (line.startsWith('* ') || line.startsWith('- ')) {
            const listItems = [];
            while (i < lines.length && (lines[i].trim().startsWith('* ') || lines[i].trim().startsWith('- '))) {
                listItems.push(<li key={i}>{renderTextWithCitations(lines[i].trim().substring(2))}</li>);
                i++;
            }
            elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-2 my-4 pl-4">{listItems}</ul>);
        } else if (line) {
            elements.push(<p key={i} className="text-gray-300 leading-relaxed my-4">{renderTextWithCitations(line)}</p>);
            i++;
        } else {
            i++;
        }
    }

    return (
        <div className="prose prose-invert max-w-none prose-p:my-4 prose-h2:mt-6 prose-h2:mb-3 prose-ul:my-4">
            {elements}
        </div>
    );
};


export const DigestModal: React.FC = () => {
    const { isDigestModalOpen, setIsDigestModalOpen, digestState, headerTitle, translateDigest, initialDigestLanguage } = useAppContext();
    const { digest: originalDigest, error, isLoading, loadingMessage } = digestState;
    
    const [displayDigest, setDisplayDigest] = useState<HistoryDigest | null>(null);
    const [isTranslating, setIsTranslating] = useState<boolean>(false);
    const [translationError, setTranslationError] = useState<string | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState<string>('original');
    
    const [copyButtonText, setCopyButtonText] = useState('Copy Digest');
    const isOpen = isDigestModalOpen;
    const onClose = () => setIsDigestModalOpen(false);
    const hasTriggeredInitialTranslation = useRef(false);

    const handleLanguageChange = async (lang: string) => {
        setSelectedLanguage(lang);
        setTranslationError(null);

        if (lang === 'original') {
            setDisplayDigest(originalDigest);
            return;
        }

        if (!originalDigest) {
            setTranslationError("Cannot translate, original digest not available.");
            return;
        }

        setIsTranslating(true);
        try {
            const translated = await translateDigest(originalDigest, lang);
            setDisplayDigest(translated);
        } catch (e) {
            setTranslationError(e instanceof Error ? e.message : "An unknown error occurred during translation.");
            setDisplayDigest(null);
        } finally {
            setIsTranslating(false);
        }
    };
    
    useEffect(() => {
        if (isOpen) {
            hasTriggeredInitialTranslation.current = false;
            setCopyButtonText('Copy Digest');
            if (originalDigest) {
                setDisplayDigest(originalDigest);
                setSelectedLanguage('original');
                setTranslationError(null);
            }
        }
    }, [originalDigest, isOpen]);

    useEffect(() => {
        if (isOpen && originalDigest && !isLoading && !hasTriggeredInitialTranslation.current) {
            if (initialDigestLanguage && initialDigestLanguage !== 'original') {
                hasTriggeredInitialTranslation.current = true;
                handleLanguageChange(initialDigestLanguage);
            }
        }
    }, [isOpen, originalDigest, isLoading, initialDigestLanguage]);
    
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);
    
    const handleCopy = () => {
        if (!displayDigest) return;
        const textToCopy = [
            `AI Digest for: ${headerTitle}\n\n`,
            `Synthesis:\n${displayDigest.synthesis}\n\n`,
            '---\n',
            ...(displayDigest.sources && displayDigest.sources.length > 0 ? [
                'Sources & Further Reading:\n',
                ...displayDigest.sources.map((source, i) =>
                    `${i + 1}. ${source.title} (${source.uri})\n`
                )
            ] : [])
        ].join('');

        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopyButtonText('Copied!');
            setTimeout(() => setCopyButtonText('Copy Digest'), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            setCopyButtonText('Error!');
        });
    };

    if (!isOpen) return null;

    const renderContent = () => {
        if (isLoading) return <LoadingSpinner message={loadingMessage} />;
        if (error) return <ErrorDisplay message={error} />;

        if (isTranslating) {
            return (
                <div className="flex flex-col justify-center items-center h-full text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                    <p className="text-lg text-gray-300">Translating to {selectedLanguage}...</p>
                </div>
            );
        }
        
        if (translationError) {
             return <ErrorDisplay message={translationError} />;
        }

        if (!displayDigest) {
            return <div className="text-center text-gray-500">No digest available.</div>;
        }

        return (
            <div className="divide-y divide-gray-700/50">
                <div className="py-6">
                    <SynthesisRenderer synthesis={displayDigest.synthesis} sources={displayDigest.sources || []} />
                </div>
                
                {displayDigest.sources && displayDigest.sources.length > 0 && (
                    <div className="py-6" id="cited-sources">
                        <h3 className="text-lg font-bold text-gray-100 mb-3">Sources &amp; Further Reading</h3>
                        <ol className="space-y-4 text-sm">
                            {displayDigest.sources.map((source, index) => (
                                <li key={index} id={`source-${index + 1}`} className="text-gray-400 transition-colors duration-500 highlight-on-target border-l-2 border-gray-700 pl-4 py-1">
                                    <p className="font-semibold text-gray-200">{index + 1}. {source.title || 'Untitled'}</p>
                                    {source.description && (
                                        <p className="text-gray-400 text-sm mt-1">{source.description}</p>
                                    )}
                                    <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline hover:text-indigo-300 text-xs truncate block mt-1" title={source.uri}>
                                        {source.uri}
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] m-4 flex flex-col">
                <header className="p-4 border-b border-gray-700 flex-shrink-0 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center">
                            <SparklesIcon className="w-6 h-6 mr-3 text-indigo-400" />AI Reading Digest
                        </h2>
                        <p className="text-sm text-gray-400 truncate mt-1">For: <span className="font-semibold text-gray-300">{headerTitle}</span></p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><XIcon className="w-6 h-6" /></button>
                </header>
                <div className="px-6 flex-1 overflow-y-auto">
                    {renderContent()}
                </div>
                <footer className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800/50 flex justify-between items-center">
                    <LanguageSelector
                        selectedLanguage={selectedLanguage}
                        onLanguageChange={handleLanguageChange}
                        isTranslating={isTranslating}
                    />
                    <button
                        onClick={handleCopy}
                        disabled={!displayDigest || isLoading || isTranslating}
                        className="px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
                    >
                        {copyButtonText}
                    </button>
                </footer>
            </div>
        </div>
    );
};
