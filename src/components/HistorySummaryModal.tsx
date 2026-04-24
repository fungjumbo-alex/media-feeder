import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import {
  XIcon,
  SparklesIcon,
  ChevronDownIcon,
  SaveIcon,
  CopyIcon,
  ClipboardCheckIcon,
} from './icons';
import { TRANSLATION_LANGUAGES } from '../types';
import type { DetailedDigest, ThematicDigest, ThematicDigestGroup } from '../types';
import { QuotaExceededError } from '../services/geminiService';
import { formatDuration } from '../utils/dateUtils';

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
      <p className="font-semibold">An error occurred:</p>
      <p>{message}</p>
    </div>
  </div>
);

const LanguageSelector: React.FC<{
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
  isTranslating: boolean;
}> = ({ selectedLanguage, onLanguageChange, isTranslating }) => {
  return (
    <div className="relative">
      <select
        value={selectedLanguage}
        onChange={e => onLanguageChange(e.target.value)}
        disabled={isTranslating}
        className="bg-gray-700 text-white font-semibold py-2 pl-3 pr-8 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-70"
        aria-label="Select translation language"
      >
        {TRANSLATION_LANGUAGES.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
        <svg
          className="fill-current h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
        >
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
  );
};

const ThematicGroup: React.FC<{ group: ThematicDigestGroup }> = ({ group }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="py-6 border-b border-gray-700/50 last:border-b-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex justify-between items-center text-left"
      >
        <h2 className="text-xl font-bold text-indigo-400">{group.themeTitle}</h2>
        <ChevronDownIcon
          className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>
      {isExpanded && (
        <div className="mt-4">
          <div className="prose prose-invert max-w-none prose-p:my-2 text-gray-300 mb-4">
            {group.themeSummary
              .split('\n')
              .filter(p => p.trim() !== '')
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
          {group.keywords && group.keywords.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Keywords:</h3>
              <div className="flex flex-wrap gap-2">
                {group.keywords.map((keyword, kIndex) => (
                  <span
                    key={kIndex}
                    className="px-2 py-1 text-xs font-medium bg-gray-700 text-gray-300 rounded-full"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
          <h3 className="text-sm font-semibold text-gray-400 mt-4 mb-2">
            Related Articles ({group.articles.length}):
          </h3>
          <ul className="list-disc list-inside space-y-2 text-sm">
            {group.articles.map((article, aIndex) => (
              <li key={aIndex}>
                <a
                  href={`#/article/${encodeURIComponent(article.feedId)}/${encodeURIComponent(article.id)}`}
                  className="text-gray-300 hover:text-indigo-300 hover:underline"
                >
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const DigestModal: React.FC = () => {
  const {
    isDigestModalOpen,
    setIsDigestModalOpen,
    digestState,
    headerTitle,
    translateDigest,
    initialDigestLanguage,
    handleSaveDigestAsNote,
    articlesForDigest,
    handleQuotaError,
    handleSuccessfulApiCall,
  } = useAppContext();
  const { digest, type: digestType, error, isLoading, loadingMessage } = digestState;

  const [displayDigest, setDisplayDigest] = useState<DetailedDigest | ThematicDigest | null>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('original');

  const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyDropdownRef = useRef<HTMLDivElement>(null);

  const isOpen = isDigestModalOpen;
  const onClose = () => setIsDigestModalOpen(false);
  const hasTriggeredInitialTranslation = useRef(false);

  const handleLanguageChange = async (lang: string) => {
    setSelectedLanguage(lang);
    setTranslationError(null);

    if (lang === 'original') {
      setDisplayDigest(digest);
      return;
    }

    if (!digest || !digestType) {
      setTranslationError('Cannot translate, original digest not available.');
      return;
    }

    setIsTranslating(true);
    try {
      const translated = await translateDigest(digest, digestType, lang);
      setDisplayDigest(translated);
      handleSuccessfulApiCall();
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        setTranslationError('Translation failed: API quota limit reached.');
        handleQuotaError({ source: 'manual' });
      } else {
        setTranslationError(
          e instanceof Error ? e.message : 'An unknown error occurred during translation.'
        );
      }
      setDisplayDigest(null);
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      hasTriggeredInitialTranslation.current = false;
      setCopyStatus('idle');
      if (digest) {
        setDisplayDigest(digest);
        setSelectedLanguage('original');
        setTranslationError(null);
      }
    }
  }, [digest, isOpen]);

  useEffect(() => {
    if (isOpen && digest && !isLoading && !hasTriggeredInitialTranslation.current) {
      if (initialDigestLanguage && initialDigestLanguage !== 'original') {
        hasTriggeredInitialTranslation.current = true;
        handleLanguageChange(initialDigestLanguage);
      }
    }
  }, [isOpen, digest, isLoading, initialDigestLanguage]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (copyDropdownRef.current && !copyDropdownRef.current.contains(event.target as Node)) {
        setIsCopyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (copyStatus !== 'idle') {
      const timer = setTimeout(() => setCopyStatus('idle'), 2000);
      return () => clearTimeout(timer);
    }
  }, [copyStatus]);

  const generateMarkdown = (): string => {
    if (!displayDigest || !digestType) return '';

    let markdown = `AI Digest for: ${headerTitle}\n\n---\n\n`;

    if (digestType === 'detailed') {
      const detailedDigest = displayDigest as DetailedDigest;
      markdown += detailedDigest
        .map(item => {
          let itemText = `## [${item.title}](${item.link})\n\n`;
          if (typeof item.summary === 'string') {
            itemText += `${item.summary}\n\n`;
          } else {
            itemText += `### Overall Summary\n${item.summary.overallSummary}\n\n`;
            if (item.summary.sections && item.summary.sections.length > 0) {
              itemText += `### Key Moments\n`;
              itemText +=
                item.summary.sections
                  .map(
                    section =>
                      `- **${formatDuration(section.timestamp)} - ${section.title}**: ${section.summary}`
                  )
                  .join('\n') + '\n\n';
            }
          }
          if (item.sources && item.sources.length > 0) {
            itemText += `**Sources:**\n`;
            itemText +=
              item.sources
                .map(source => `- [${source.title || source.uri}](${source.uri})`)
                .join('\n') + '\n\n';
          }
          return itemText;
        })
        .join('---\n\n');
    } else {
      // thematic
      const thematicDigest = displayDigest as ThematicDigest;
      markdown += `# ${thematicDigest.digestTitle}\n\n`;
      markdown += thematicDigest.themedGroups
        .map(group => {
          let groupText = `## ${group.themeTitle}\n\n${group.themeSummary}\n\n`;
          if (group.keywords && group.keywords.length > 0) {
            groupText += `**Keywords:** ${group.keywords.join(', ')}\n\n`;
          }
          groupText += `**Related Articles:**\n`;
          groupText += group.articles
            .map(article => `- [${article.title}](${article.link})`)
            .join('\n');
          return groupText;
        })
        .join('\n\n---\n\n');
    }
    return markdown;
  };

  const generateHtml = (): string => {
    if (!displayDigest || !digestType) return '';

    let html = `<h1>AI Digest for: ${headerTitle}</h1><hr>`;

    if (digestType === 'detailed') {
      const detailedDigest = displayDigest as DetailedDigest;
      html += detailedDigest
        .map(item => {
          let itemHtml = `<h2><a href="${item.link}">${item.title}</a></h2>`;
          if (typeof item.summary === 'string') {
            itemHtml += `<p>${item.summary.replace(/\n/g, '<br>')}</p>`;
          } else {
            // StructuredVideoSummary
            itemHtml += `<h3>Overall Summary</h3><p>${item.summary.overallSummary.replace(/\n/g, '<br>')}</p>`;
            if (item.summary.sections && item.summary.sections.length > 0) {
              itemHtml += `<h3>Key Moments</h3><ul>`;
              itemHtml += item.summary.sections
                .map(
                  section =>
                    `<li><strong>${formatDuration(section.timestamp)} - ${section.title}</strong>: ${section.summary}</li>`
                )
                .join('');
              itemHtml += `</ul>`;
            }
          }
          if (item.sources && item.sources.length > 0) {
            itemHtml += `<p><strong>Sources:</strong></p><ul>`;
            itemHtml += item.sources
              .map(source => `<li><a href="${source.uri}">${source.title || source.uri}</a></li>`)
              .join('');
            itemHtml += `</ul>`;
          }
          return itemHtml;
        })
        .join('<hr>');
    } else {
      // thematic
      const thematicDigest = displayDigest as ThematicDigest;
      html += `<h1>${thematicDigest.digestTitle}</h1>`;
      html += thematicDigest.themedGroups
        .map(group => {
          let groupHtml = `<h2>${group.themeTitle}</h2><p>${group.themeSummary.replace(/\n/g, '<br>')}</p>`;
          if (group.keywords && group.keywords.length > 0) {
            groupHtml += `<p><strong>Keywords:</strong> ${group.keywords.join(', ')}</p>`;
          }
          groupHtml += `<p><strong>Related Articles:</strong></p><ul>`;
          groupHtml += group.articles
            .map(article => `<li><a href="${article.link}">${article.title}</a></li>`)
            .join('');
          groupHtml += `</ul>`;
          return groupHtml;
        })
        .join('<hr>');
    }
    return html;
  };

  const handleCopy = async (format: 'markdown' | 'html') => {
    setIsCopyDropdownOpen(false);
    try {
      if (format === 'markdown') {
        const markdown = generateMarkdown();
        await navigator.clipboard.writeText(markdown);
      } else {
        // html
        const html = generateHtml();
        const blob = new Blob([html], { type: 'text/html' });
        const clipboardItem = new ClipboardItem({ 'text/html': blob });
        await navigator.clipboard.write([clipboardItem]);
      }
      setCopyStatus('copied');
    } catch (err) {
      console.error('Failed to copy: ', err);
      setCopyStatus('error');
    }
  };

  if (!isOpen) return null;

  const renderContent = () => {
    if (isLoading) return <LoadingSpinner message={loadingMessage} />;
    if (error) return <ErrorDisplay message={error} />;
    if (isTranslating) {
      return (
        <div className="flex flex-col justify-center items-center h-full text-center">
          {' '}
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>{' '}
          <p className="text-lg text-gray-300">Translating to {selectedLanguage}...</p>{' '}
          <p className="text-sm text-gray-500">This may take a moment.</p>{' '}
        </div>
      );
    }
    if (translationError) return <ErrorDisplay message={translationError} />;
    if (!displayDigest || !digestType)
      return <div className="text-center text-gray-500">No digest available.</div>;

    if (digestType === 'thematic') {
      const thematicDigest = displayDigest as ThematicDigest;
      return (
        <div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            {thematicDigest.digestTitle}
          </h1>
          {thematicDigest.themedGroups.map((group, index) => (
            <ThematicGroup key={index} group={group} />
          ))}
        </div>
      );
    }

    if (digestType === 'detailed') {
      const detailedDigest = displayDigest as DetailedDigest;
      return (
        <div className="divide-y divide-gray-700/50">
          {detailedDigest.map((item, index) => (
            <div key={item.link || index} className="py-6">
              <h2 className="text-xl font-bold text-white mb-2">{item.title}</h2>
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-400 hover:underline truncate block mb-4"
                >
                  {item.link}
                </a>
              )}

              {typeof item.summary === 'string' ? (
                <div className="prose prose-invert max-w-none prose-p:my-2 prose-sm">
                  {item.summary
                    .split('\n')
                    .filter(p => p.trim() !== '')
                    .map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                </div>
              ) : (
                <div>
                  <div className="prose prose-invert max-w-none prose-p:my-2 prose-sm">
                    {item.summary.overallSummary
                      .split('\n')
                      .filter(p => p.trim() !== '')
                      .map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                  </div>
                  {item.summary.sections && item.summary.sections.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {item.summary.sections.map((section, secIndex) => (
                        <div key={secIndex} className="bg-gray-900/50 p-3 rounded-md">
                          <p className="font-semibold text-indigo-400 text-sm">
                            {' '}
                            <span className="font-mono">
                              {formatDuration(section.timestamp)}
                            </span>{' '}
                            - {section.title}{' '}
                          </p>
                          <p className="text-sm text-gray-400 mt-1">{section.summary}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {item.sources && item.sources.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-700/50">
                  <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Sources</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    {item.sources.map((source, sourceIndex) => (
                      <li key={sourceIndex} className="text-gray-400 truncate">
                        <a
                          href={source.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:underline hover:text-indigo-300"
                          title={source.uri}
                        >
                          {' '}
                          {source.title || source.uri}{' '}
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] m-4 flex flex-col">
        <header className="p-4 border-b border-gray-700 flex-shrink-0 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center">
              <SparklesIcon className="w-6 h-6 mr-3 text-indigo-400" />
              AI Reading Digest
            </h2>
            <p className="text-sm text-gray-400 truncate mt-1">
              For: <span className="font-semibold text-gray-300">{headerTitle}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon className="w-6 h-6" />
          </button>
        </header>
        <div className="px-6 flex-1 overflow-y-auto">{renderContent()}</div>
        <footer className="p-4 border-t border-gray-700 flex-shrink-0 bg-gray-800/50 flex justify-between items-center">
          <LanguageSelector
            selectedLanguage={selectedLanguage}
            onLanguageChange={handleLanguageChange}
            isTranslating={isTranslating}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                displayDigest && handleSaveDigestAsNote(displayDigest, articlesForDigest)
              }
              disabled={!displayDigest || isLoading || isTranslating}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-600 text-white font-semibold hover:bg-gray-500 disabled:opacity-50"
              title="Save Digest as Note"
            >
              <SaveIcon className="w-5 h-5" />
            </button>
            <div className="relative" ref={copyDropdownRef}>
              <button
                onClick={() => setIsCopyDropdownOpen(p => !p)}
                disabled={!displayDigest || isLoading || isTranslating}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
              >
                {copyStatus === 'idle' && (
                  <>
                    <CopyIcon className="w-5 h-5" />
                    Copy Digest
                  </>
                )}
                {copyStatus === 'copied' && (
                  <>
                    <ClipboardCheckIcon className="w-5 h-5" />
                    Copied!
                  </>
                )}
                {copyStatus === 'error' && 'Error!'}
                <ChevronDownIcon
                  className={`w-4 h-4 ml-1 transition-transform ${isCopyDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isCopyDropdownOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-48 bg-gray-700 rounded-md shadow-lg z-10 border border-gray-600 p-1">
                  <button
                    onClick={() => handleCopy('html')}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-md text-gray-200 hover:bg-indigo-600 hover:text-white"
                  >
                    Copy as Rich Text
                  </button>
                  <button
                    onClick={() => handleCopy('markdown')}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-md text-gray-200 hover:bg-indigo-600 hover:text-white"
                  >
                    Copy as Markdown
                  </button>
                </div>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
