import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import {
  XIcon,
  SparklesIcon,
  ExternalLinkIcon,
  EyeIcon,
  BookmarkIcon,
  CheckCircleIcon,
  MaximizeIcon,
  RestoreIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LikeIcon,
  SkipForwardIcon,
  ShuffleIcon,
  CommentIcon,
  ListIcon,
  RssIcon,
  ChevronDownIcon,
  DownloadIcon,
  VideoIcon,
  MusicIcon,
  ChevronUpIcon,
  TagIcon,
  TrashIcon,
  RepeatIcon,
  SaveIcon,
  CopyIcon,
  ClipboardCheckIcon,
  ClockIcon,
  CalendarIcon,
} from './icons';
import {
  summarizeText,
  summarizeYouTubeVideo,
  fetchAvailableCaptionChoices,
  fetchAndParseTranscript,
  translateText,
  translateStructuredSummary,
  QuotaExceededError,
} from '../services/geminiService';
import { INVIDIOUS_INSTANCES } from '../services/proxyService';
import { getYouTubeId } from '../services/youtubeService';
import { TRANSLATION_LANGUAGES } from '../types';
import type {
  TranscriptLine,
  CaptionChoice,
  StructuredVideoSummary,
  YouTubeComment,
  AiModel,
} from '../types';
import { formatRelativeDate } from '../utils/dateUtils';

const formatViews = (views: number | null | undefined): string => {
  if (views === null || views === undefined) return '';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K views`;
  return `${views} views`;
};

const setLinksToOpenInNewTab = (htmlString: string): string => {
  if (!htmlString) return '';
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;
    tempDiv.querySelectorAll('a').forEach(link => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    return tempDiv.innerHTML;
  } catch (e) {
    console.error('Failed to process HTML to modify links:', e);
    return htmlString;
  }
};

const ensureYouTubeApiReady = (() => {
  let apiReadyPromise: Promise<void> | null = null;
  return () => {
    if (!apiReadyPromise) {
      apiReadyPromise = new Promise(resolve => {
        if (window.YT && window.YT.Player) {
          return resolve();
        }
        const previousCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (previousCallback) {
            previousCallback();
          }
          resolve();
        };
      });
    }
    return apiReadyPromise;
  };
})();

const formatTranscriptTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const date = new Date(0);
  date.setSeconds(seconds);
  const timeString = date.toISOString().substr(11, 8);
  if (timeString.startsWith('00:')) {
    return timeString.substr(3);
  }
  return timeString;
};

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur', 'yi', 'syr', 'dv'];
const isRtl = (langCode: string | undefined): boolean => {
  if (!langCode) return false;
  const baseLang = langCode.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.includes(baseLang);
};

type ActiveTab = 'summary' | 'transcript' | 'comments' | 'details';

const CommentItem: React.FC<{ comment: YouTubeComment }> = ({ comment }) => {
  return (
    <div className="flex items-start gap-3 py-2">
      <img
        src={comment.authorThumbnails[0]?.url}
        alt={comment.author}
        className="w-8 h-8 rounded-full bg-gray-700"
      />
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-semibold text-gray-200">{comment.author}</p>
          <p className="text-xs text-gray-500">{comment.publishedText}</p>
        </div>
        <div
          className="text-sm text-gray-300 mt-1 prose prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: comment.contentHtml }}
        />
        {comment.likeCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
            <LikeIcon className="w-3 h-3" />
            <span>{comment.likeCount.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const Tooltip: React.FC<{ text: string; children: React.ReactNode; isMobile?: boolean }> = ({
  text,
  children,
  isMobile,
}) => {
  if (isMobile) {
    if (React.isValidElement(children)) {
      const originalTouchStart = (children.props as any).onTouchStart;
      return React.cloneElement(children as React.ReactElement<any>, {
        onTouchStart: (e: React.TouchEvent) => {
          e.stopPropagation();
          if (originalTouchStart) originalTouchStart(e);
        },
      });
    }
    return <>{children}</>;
  }
  return (
    <div className="group relative">
      {children}
      <div className="absolute top-full mt-2 w-max max-w-xs px-2 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg left-1/2 -translate-x-1/2">
        {text}
      </div>
    </div>
  );
};

const LanguageSelector: React.FC<{
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
  isTranslating: boolean;
  disabled: boolean;
}> = ({ selectedLanguage, onLanguageChange, isTranslating, disabled }) => {
  return (
    <div className="relative">
      <select
        value={selectedLanguage}
        onChange={e => onLanguageChange(e.target.value)}
        disabled={isTranslating || disabled}
        className="bg-gray-700 text-white font-semibold py-1 pl-2 pr-8 rounded-md appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-70 text-xs"
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

const SummaryRenderer: React.FC<{ text: string }> = ({ text }) => (
  <div className="prose prose-invert max-w-none prose-p:my-2 prose-sm">
    {text
      .split('\n')
      .filter(p => p.trim() !== '')
      .map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
  </div>
);

export const ArticleModal: React.FC = () => {
  const {
    selectedArticle: article,
    handleCloseArticleModal,
    handleSummaryGenerated,
    readArticleIds,
    handleToggleReadStatus,
    readLaterArticleIds,
    handleToggleReadLater,
    likedVideoIds,
    handleLikeVideo,
    articleNavigation,
    aiModel,
    autoplayMode,
    handleToggleAutoplayNext,
    handleToggleAutoplayRandom,
    handleToggleAutoplayRepeat,
    articlesForNavigation,
    commentsState,
    handleFetchComments,
    handleFetchArticleDetails,
    handleOpenArticle,
    feeds,
    handleViewChange,
    autoLikeYouTubeVideos,
    autoLikeDelaySeconds,
    setArticleToEditTags,
    handleSaveSummaryAsNote,
    handleRemoveArticle,
    trendingKeywords,
    defaultAiLanguage,
    handleQuotaError,
    handleSuccessfulApiCall,
  } = useAppContext();

  const [summary, setSummary] = useState<string | null>(null);
  const [structuredSummary, setStructuredSummary] = useState<StructuredVideoSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [displaySummary, setDisplaySummary] = useState<string | null>(null);
  const [displayStructuredSummary, setDisplayStructuredSummary] =
    useState<StructuredVideoSummary | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('original');
  const modalRef = useRef<HTMLDivElement>(null);
  const videoPlayerContainerRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; isInsideVideo: boolean } | null>(null);
  const touchEndRef = useRef<number | null>(null);
  const minSwipeDistance = 50;
  const [transcriptData, setTranscriptData] = useState<{
    transcript: TranscriptLine[];
    language: string | undefined;
  } | null>(null);
  const [isFetchingTranscript, setIsFetchingTranscript] = useState<boolean>(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [activeTranscriptIndex, setActiveTranscriptIndex] = useState<number | null>(null);
  const [isAutoscrollActive, setIsAutoscrollActive] = useState<boolean>(true);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const timeUpdateIntervalRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary');
  const isProgrammaticScroll = useRef(false);
  const scrollTimeoutRef = useRef<number | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [panelHeight, setPanelHeight] = useState<number>(0);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const panelResizeStartRef = useRef<{ y: number; initialHeight: number } | null>(null);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isPanelMinimized, setIsPanelMinimized] = useState(false);
  const lastArticleIdRef = useRef<string | null>(null);
  const [captionChoices, setCaptionChoices] = useState<CaptionChoice[] | null>(null);
  const [selectedCaptionUrl, setSelectedCaptionUrl] = useState<string | null>(null);
  const [isFetchingChoices, setIsFetchingChoices] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDownloadDropdownOpen, setIsDownloadDropdownOpen] = useState(false);
  const downloadDropdownRef = useRef<HTMLDivElement>(null);
  const [audioDownloadUrl, setAudioDownloadUrl] = useState<string | null>(null);
  const [video1080pDownloadUrl, setVideo1080pDownloadUrl] = useState<string | null>(null);
  const [video360pDownloadUrl, setVideo360pDownloadUrl] = useState<string | null>(null);
  const [isMobilePanelMinimized, setIsMobilePanelMinimized] = useState(true);
  const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyDropdownRef = useRef<HTMLDivElement>(null);

  const isTouchDevice = useMemo(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, []);

  const playerRef = useRef<YT.Player | null>(null);
  const autoplayModeRef = useRef(autoplayMode);
  useEffect(() => {
    autoplayModeRef.current = autoplayMode;
  }, [autoplayMode]);
  const navigationRef = useRef(articleNavigation);
  useEffect(() => {
    navigationRef.current = articleNavigation;
  }, [articleNavigation]);
  const articlesForNavigationRef = useRef(articlesForNavigation);
  useEffect(() => {
    articlesForNavigationRef.current = articlesForNavigation;
  }, [articlesForNavigation]);
  const currentArticleRef = useRef(article);
  useEffect(() => {
    currentArticleRef.current = article;
  }, [article]);
  const handleOpenArticleRef = useRef(handleOpenArticle);
  useEffect(() => {
    handleOpenArticleRef.current = handleOpenArticle;
  }, [handleOpenArticle]);

  const keywords = useMemo(() => {
    if (!article || !trendingKeywords || trendingKeywords.length === 0) {
      return [];
    }
    const lowerCaseTitle = article.title.toLowerCase();
    // Filter the global trending keywords to find ones present in this specific title.
    // The `\b` word boundary in the previous regex did not work for languages without clear word separators, like Chinese.
    // This simpler `includes` check is language-agnostic.
    return trendingKeywords.filter(kwObj => {
      // kwObj.keyword is already lowercase from the generation process in AppContext.
      return lowerCaseTitle.includes(kwObj.keyword);
    });
  }, [article, trendingKeywords]);

  const handleKeywordClick = (keyword: { keyword: string; count: number }) => {
    handleViewChange('keyword-articles', keyword.keyword);
    // Do not close the modal, allow user to click multiple keywords.
    // The view will change in the background.
  };

  const handleClose = useCallback(() => {
    window.speechSynthesis.cancel();
    handleCloseArticleModal();
  }, [handleCloseArticleModal]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const toggleMobilePanel = useCallback(() => {
    setIsMobilePanelMinimized(p => !p);
  }, []);

  const videoId = useMemo(() => getYouTubeId(article?.link ?? null), [article]);
  const isLiked = useMemo(
    () => (videoId ? likedVideoIds.has(videoId) : false),
    [videoId, likedVideoIds]
  );
  const canSummarize = useMemo(() => {
    if (!article) return false;
    if (videoId) {
      // For videos, we can always attempt summarization (either via transcript or fallback).
      return true;
    } else {
      // For articles, check for sufficient content.
      const plainText = (article.content || article.description).replace(/<[^>]*>?/gm, '');
      return plainText.trim().length >= 50 || !!article.link;
    }
  }, [article, videoId]);

  const processedContentForDisplay = useMemo(() => {
    if (!article) return '';

    const content = article.content || article.description;
    if (videoId) return content;

    return setLinksToOpenInNewTab(content);
  }, [article, videoId]);

  const showDetailsTab = article?.hasIframe || (videoId && article?.description);
  const hasTranscript = (!!transcriptData?.transcript && transcriptData.transcript.length > 0) ||
    (!!captionChoices && captionChoices.length > 0);
  const currentFeed = useMemo(() => {
    if (!article) return null;
    return feeds.find(f => f.id === article.feedId);
  }, [feeds, article]);
  const channelLinkUrl =
    currentFeed?.isPlaylist && currentFeed.channelUrl ? currentFeed.channelUrl : article?.feedId;
  const handleNavigateToFeed = () => {
    if (channelLinkUrl) handleViewChange('feed', channelLinkUrl);
  };

  const handleLanguageChange = async (lang: string) => {
    setSelectedLanguage(lang);
    setTranslationError(null);

    if (lang === 'original') {
      setDisplaySummary(summary || structuredSummary?.overallSummary || null);
      setDisplayStructuredSummary(structuredSummary);
      return;
    }

    setIsTranslating(true);

    try {
      if (structuredSummary) {
        const translatedSummary = await translateStructuredSummary(
          structuredSummary,
          lang,
          aiModel as AiModel
        );
        setDisplayStructuredSummary(translatedSummary);
        setDisplaySummary(translatedSummary.overallSummary);
      } else if (summary) {
        const translated = await translateText(summary, lang, aiModel as AiModel);
        setDisplaySummary(translated);
        setDisplayStructuredSummary(null);
      } else {
        setTranslationError('Cannot translate; original summary not available.');
        setDisplaySummary(null);
        setDisplayStructuredSummary(null);
      }
    } catch (e) {
      setTranslationError(e instanceof Error ? e.message : 'Translation failed.');
      setDisplaySummary(null);
      setDisplayStructuredSummary(null);
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    if (videoId && INVIDIOUS_INSTANCES.length > 0) {
      setAudioDownloadUrl(`${INVIDIOUS_INSTANCES[0]}/latest_version?id=${videoId}&itag=251`);
      setVideo1080pDownloadUrl(`${INVIDIOUS_INSTANCES[0]}/latest_version?id=${videoId}&itag=137`);
      setVideo360pDownloadUrl(`${INVIDIOUS_INSTANCES[0]}/latest_version?id=${videoId}&itag=18`);
    } else {
      setAudioDownloadUrl(null);
      setVideo1080pDownloadUrl(null);
      setVideo360pDownloadUrl(null);
    }
  }, [videoId]);

  const dropdownOptions = useMemo(() => {
    const options: {
      id: ActiveTab;
      label: string;
      icon: React.FC<React.SVGProps<SVGSVGElement>>;
    }[] = [{ id: 'summary', label: 'AI Summary', icon: SparklesIcon }];
    if (hasTranscript) options.push({ id: 'transcript', label: 'Transcript', icon: ListIcon });
    if (showDetailsTab) options.push({ id: 'details', label: 'Details', icon: RssIcon });
    if (videoId) options.push({ id: 'comments', label: 'Comments', icon: CommentIcon });
    return options;
  }, [hasTranscript, showDetailsTab, videoId]);

  useEffect(() => {
    const availableTabs = new Set(dropdownOptions.map(opt => opt.id));
    if (!availableTabs.has(activeTab)) setActiveTab(showDetailsTab ? 'details' : 'summary');
  }, [activeTab, dropdownOptions, showDetailsTab]);

  useEffect(() => {
    if (modalRef.current) modalRef.current.focus();

    if (article && !isInitializedRef.current) {
      const isMobile = document.documentElement.clientWidth < 768;
      setIsMobileLayout(isMobile);
      if (isMobile) setPanelHeight(document.documentElement.clientHeight * 0.5);
      else setPanelHeight(0);
      isInitializedRef.current = true;
    }
    if (!article) {
      isInitializedRef.current = false;
      lastArticleIdRef.current = null;
    }

    if (article && article.id !== lastArticleIdRef.current) {
      modalRef.current?.querySelector('.article-content-area')?.scrollTo(0, 0);
      setTranscriptData(null);
      setIsFetchingTranscript(false);
      setTranscriptError(null);
      setActiveTranscriptIndex(null);
      setIsAutoscrollActive(true);

      let newDefaultTab: ActiveTab = 'summary';
      if (showDetailsTab && !article.structuredSummary && !article.summary) {
        newDefaultTab = 'details';
      }
      setActiveTab(newDefaultTab);

      setIsTheaterMode(false);
      setCaptionChoices(null);
      setSelectedCaptionUrl(null);
      setIsFetchingChoices(false);
      if (videoId) handleFetchComments(videoId);
      if (article.isVideo && !article.content) handleFetchArticleDetails(article.id);
    }

    if (article) {
      lastArticleIdRef.current = article.id;
      setSummary(article.summary || null);
      setStructuredSummary(article.structuredSummary || null);
      setDisplaySummary(article.structuredSummary?.overallSummary || article.summary || null);
      setDisplayStructuredSummary(article.structuredSummary || null);
      setSelectedLanguage('original');
      setTranslationError(null);
      setIsTranslating(false);
      setIsSummarizing(false);
      setError(null);
    }

    window.speechSynthesis.cancel();
  }, [article, videoId, handleFetchComments, showDetailsTab, handleFetchArticleDetails]);

  const handlePanelResizeStart = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPanelResizing(true);
    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    panelResizeStartRef.current = { y: startY, initialHeight: panelHeight };
    document.body.style.userSelect = 'none';
  };

  const handlePanelResizeMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isPanelResizing || !panelResizeStartRef.current) return;
      if (e.cancelable) e.preventDefault();
      const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dy = panelResizeStartRef.current.y - currentY;
      const newHeight = panelResizeStartRef.current.initialHeight + dy;
      const minHeight = 40;
      const maxHeight = window.innerHeight - 80;
      setPanelHeight(Math.max(minHeight, Math.min(newHeight, maxHeight)));
    },
    [isPanelResizing]
  );

  const handlePanelResizeEnd = useCallback(() => {
    setIsPanelResizing(false);
    panelResizeStartRef.current = null;
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    if (isPanelResizing) {
      window.addEventListener('mousemove', handlePanelResizeMove);
      window.addEventListener('mouseup', handlePanelResizeEnd);
      window.addEventListener('touchmove', handlePanelResizeMove, { passive: false });
      window.addEventListener('touchend', handlePanelResizeEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handlePanelResizeMove);
      window.removeEventListener('mouseup', handlePanelResizeEnd);
      window.removeEventListener('touchmove', handlePanelResizeMove);
      window.removeEventListener('touchend', handlePanelResizeEnd);
    };
  }, [isPanelResizing, handlePanelResizeMove, handlePanelResizeEnd]);

  useEffect(() => {
    if (!article) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        if (playerRef.current && typeof playerRef.current.getPlayerState === 'function') {
          const playerState = playerRef.current.getPlayerState();
          if (playerState === YT.PlayerState.PLAYING) {
            playerRef.current.pauseVideo();
          } else {
            playerRef.current.playVideo();
          }
        }
      } else if (event.key === 'Escape') {
        if (isTheaterMode) {
          setIsTheaterMode(false);
        } else {
          handleClose();
        }
      } else if (event.key === 'ArrowRight' && articleNavigation.hasNextArticle) {
        articleNavigation.onNextArticle();
      } else if (event.key === 'ArrowLeft' && articleNavigation.hasPreviousArticle) {
        articleNavigation.onPreviousArticle();
      } else if (event.key.toLowerCase() === 'r') {
        handleToggleReadLater(article.id);
      } else if (event.key.toLowerCase() === 'l') {
        handleLikeVideo(article);
      } else if (event.key.toLowerCase() === 't' && article.isVideo) {
        setActiveTab('transcript');
      } else if (event.key.toLowerCase() === 'a') {
        setActiveTab('summary');
      } else if (event.key.toLowerCase() === 'c') {
        setActiveTab('comments');
      } else if (event.key.toLowerCase() === 'd') {
        setActiveTab('details');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    article,
    handleClose,
    articleNavigation,
    isTheaterMode,
    handleToggleReadLater,
    handleLikeVideo,
    setActiveTab,
  ]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const isInsideVideo = videoPlayerContainerRef.current?.contains(e.target as Node) ?? false;
    touchEndRef.current = null;
    touchStartRef.current = { x: e.targetTouches[0].clientX, isInsideVideo };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current && !touchStartRef.current.isInsideVideo)
      touchEndRef.current = e.targetTouches[0].clientX;
  };
  const handleTouchEnd = () => {
    if (!touchStartRef.current || !touchEndRef.current || touchStartRef.current.isInsideVideo) {
      touchStartRef.current = null;
      touchEndRef.current = null;
      return;
    }
    const distance = touchStartRef.current.x - touchEndRef.current;
    if (distance > minSwipeDistance && articleNavigation.hasNextArticle)
      articleNavigation.onNextArticle();
    if (distance < -minSwipeDistance && articleNavigation.hasPreviousArticle)
      articleNavigation.onPreviousArticle();
    touchStartRef.current = null;
    touchEndRef.current = null;
  };

  const handleSummarizeContent = useCallback(async () => {
    if (!article) return;

    // Reset UI state
    window.speechSynthesis.cancel();
    setActiveTab('summary');
    setIsSummarizing(true);
    setError(null);
    setSummary(null);
    setStructuredSummary(null);
    setDisplaySummary(null);
    setDisplayStructuredSummary(null);

    try {
      if (videoId) {
        // It's a video. First, try to get a transcript.
        try {
          const choices = await fetchAvailableCaptionChoices(videoId);
          if (choices.length > 0) {
            const transcriptLines = await fetchAndParseTranscript(choices[0].url);
            if (transcriptLines.length < 3)
              throw new Error('Transcript is too short to summarize.');

            const { summary: newStructuredSummary, sources } = await summarizeYouTubeVideo(
              article.title,
              transcriptLines,
              aiModel as AiModel,
              defaultAiLanguage
            );
            handleSummaryGenerated(article.id, newStructuredSummary, sources);
            handleSuccessfulApiCall();
          } else {
            throw new Error('No transcripts available for this video.');
          }
        } catch (transcriptError) {
          // This catch block handles both "no transcript" and errors during fetching.
          console.warn(
            'Transcript summarization failed, falling back to text summary. Reason:',
            transcriptError
          );

          const plainText = `Title: ${article.title}\nDescription: ${(article.content || article.description).replace(/<[^>]*>?/gm, '').trim()}`;
          if (plainText.trim().length < 50) {
            throw new Error('Video title and description are too short for a meaningful summary.');
          }

          const { summary: newSummary, sources } = await summarizeText(
            plainText,
            article.link,
            aiModel as AiModel,
            defaultAiLanguage,
            'video'
          );
          handleSummaryGenerated(article.id, newSummary, sources);
          handleSuccessfulApiCall();
        }
      } else {
        // It's a regular article.
        const plainText = (article.content || article.description).replace(/<[^>]*>?/gm, '');
        if (plainText.trim().length < 50 && !article.link) {
          throw new Error(
            'The content from the feed is too short to summarize, and no link is available for external lookup.'
          );
        }
        const { summary: newSummary, sources } = await summarizeText(
          plainText,
          article.link,
          aiModel as AiModel,
          defaultAiLanguage
        );
        handleSummaryGenerated(article.id, newSummary, sources);
        handleSuccessfulApiCall();
      }
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        setError('API quota limit reached. Please try again later.');
        handleQuotaError({ source: 'manual' });
      } else {
        setError(
          e instanceof Error ? e.message : 'An unknown error occurred during summarization.'
        );
      }
    } finally {
      setIsSummarizing(false);
    }
  }, [
    article,
    videoId,
    aiModel,
    handleSummaryGenerated,
    defaultAiLanguage,
    handleSuccessfulApiCall,
    handleQuotaError,
  ]);

  useEffect(() => {
    if (videoId) {
      const fetchChoices = async () => {
        setIsFetchingChoices(true);
        setTranscriptError(null);
        try {
          const choices = await fetchAvailableCaptionChoices(videoId);
          setCaptionChoices(choices);
          if (choices.length > 0) {
            setSelectedCaptionUrl(choices[0].url);
            // The useEffect on selectedCaptionUrl will handle the fetch
          } else setTranscriptError('No transcripts available for this video.');
        } catch (e) {
          setTranscriptError(
            e instanceof Error ? e.message : 'Could not fetch transcript languages.'
          );
        } finally {
          setIsFetchingChoices(false);
        }
      };
      fetchChoices();
    }
  }, [videoId]);

  useEffect(() => {
    if (captionChoices && captionChoices.length > 0) {
      const fetchTranscriptResiliently = async () => {
        setIsFetchingTranscript(true);
        setTranscriptError(null);
        setTranscriptData(null);

        let lastError: any = null;
        // Try each choice in order
        for (const choice of captionChoices) {
          try {
            console.log(`[Transcript] Trying choice: ${choice.label} (${choice.url})`);
            setSelectedCaptionUrl(choice.url); // Keep UI in sync
            const transcript = await fetchAndParseTranscript(choice.url);

            if (transcript && transcript.length > 0) {
              setTranscriptData({ transcript, language: choice.label });
              lineRefs.current = [];
              setIsFetchingTranscript(false);
              return; // Success!
            }
          } catch (e) {
            console.warn(`[Transcript] Choice ${choice.label} failed:`, e);
            lastError = e;
          }
        }

        // If we get here, all choices failed
        const errorMsg = lastError instanceof Error ? lastError.message : 'Failed to load any available transcript tracks.';
        setTranscriptError(errorMsg);
        setIsFetchingTranscript(false);
      };

      fetchTranscriptResiliently();
    }
  }, [captionChoices]);

  const handleLikeClick = () => {
    if (!article || !article.isVideo) return;
    const videoId = getYouTubeId(article.link);
    if (!videoId || likedVideoIds.has(videoId)) return;
    handleLikeVideo(article);
  };

  useEffect(() => {
    if (!article || !videoId || !autoLikeYouTubeVideos || isLiked) return;
    const timer = setTimeout(() => {
      handleLikeVideo(article, { isAutoLike: true });
    }, autoLikeDelaySeconds * 1000);
    return () => clearTimeout(timer);
  }, [article, videoId, autoLikeYouTubeVideos, isLiked, handleLikeVideo, autoLikeDelaySeconds]);

  const stopTranscriptSync = useCallback(() => {
    if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
    timeUpdateIntervalRef.current = null;
  }, []);
  const startTranscriptSync = useCallback(() => {
    stopTranscriptSync();
    const transcript = transcriptData?.transcript;
    if (!playerRef.current || !transcript) return;
    timeUpdateIntervalRef.current = window.setInterval(() => {
      const localPlayer = playerRef.current;
      const localTranscript = transcriptData?.transcript;
      if (!localPlayer || !localTranscript) return;
      const currentTime = localPlayer.getCurrentTime();
      if (typeof currentTime !== 'number') return;
      let newIndex = -1;
      for (let i = localTranscript.length - 1; i >= 0; i--)
        if (localTranscript[i].start <= currentTime) {
          newIndex = i;
          break;
        }
      setActiveTranscriptIndex(prevIndex =>
        newIndex !== -1 && newIndex !== prevIndex ? newIndex : prevIndex
      );
    }, 250);
  }, [stopTranscriptSync, transcriptData]);

  useEffect(() => {
    if (
      isAutoscrollActive &&
      activeTranscriptIndex !== null &&
      lineRefs.current[activeTranscriptIndex]
    ) {
      isProgrammaticScroll.current = true;
      lineRefs.current[activeTranscriptIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = window.setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 1000);
    }
  }, [activeTranscriptIndex, isAutoscrollActive]);

  const handleManualScroll = () => {
    if (isProgrammaticScroll.current) return;
    setIsAutoscrollActive(false);
  };

  const onPlayerStateChange = useCallback(
    (event: YT.PlayerStateChangeEvent) => {
      modalRef.current?.focus();
      if (event.data === YT.PlayerState.PLAYING) startTranscriptSync();
      else stopTranscriptSync();
      if (event.data === YT.PlayerState.CUED && autoplayModeRef.current !== 'off')
        event.target.playVideo();
      if (event.data === YT.PlayerState.ENDED) {
        if (autoplayModeRef.current === 'repeat') {
          event.target.seekTo(0, true);
          event.target.playVideo();
        } else if (autoplayModeRef.current === 'on') {
          if (navigationRef.current.hasNextArticle) navigationRef.current.onNextArticle();
        } else if (autoplayModeRef.current === 'random') {
          const videoArticles = articlesForNavigationRef.current.filter(a => a.isVideo);
          if (videoArticles.length <= 1) return;
          const currentArticleId = currentArticleRef.current?.id;
          const potentialNextArticles = videoArticles.filter(a => a.id !== currentArticleId);
          const nextArticle =
            potentialNextArticles.length > 0
              ? potentialNextArticles[Math.floor(Math.random() * potentialNextArticles.length)]
              : videoArticles[0];
          handleOpenArticleRef.current(nextArticle);
        }
      }
    },
    [startTranscriptSync, stopTranscriptSync]
  );

  const onPlayerError = useCallback((event: { data: number; target: YT.Player }) => {
    console.error('YouTube Player Error:', event.data);
    let errorMessage = 'An unknown error occurred with the YouTube player.';
    switch (event.data) {
      case 2:
        errorMessage = 'The video ID is invalid.';
        break;
      case 5:
        errorMessage = 'An error occurred in the HTML5 player.';
        break;
      case 100:
        errorMessage = 'The video was not found or has been removed.';
        break;
      case 101:
      case 150:
        errorMessage = 'The video owner does not allow it to be played in embedded players.';
        break;
    }
    setError(errorMessage);
  }, []);

  const onPlayerStateChangeRef = useRef(onPlayerStateChange);
  useEffect(() => {
    onPlayerStateChangeRef.current = onPlayerStateChange;
  }, [onPlayerStateChange]);
  const onPlayerErrorRef = useRef(onPlayerError);
  useEffect(() => {
    onPlayerErrorRef.current = onPlayerError;
  }, [onPlayerError]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.error('Error destroying YouTube player:', e);
        }
        playerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const playerElementId = 'youtube-player-container';
    const managePlayer = async () => {
      if (videoId) {
        await ensureYouTubeApiReady();
        if (playerRef.current) {
          // Check if player is ready and has the method
          try {
            const playerUrl = typeof playerRef.current.getVideoUrl === 'function'
              ? playerRef.current.getVideoUrl()
              : null;
            if (!playerUrl || !playerUrl.includes(videoId)) {
              if (typeof playerRef.current.loadVideoById === 'function') {
                playerRef.current.loadVideoById(videoId);
              }
            }
          } catch (e) {
            // If methods fail, player might not be ready yet - skip update
            console.warn('[YouTube Player] Player methods not ready yet, skipping video update');
          }
        } else {
          playerRef.current = new YT.Player(playerElementId, {
            videoId,
            playerVars: {
              controls: 1,
              rel: 0,
              showinfo: 0,
              iv_load_policy: 3,
              modestbranding: 1,
              origin: window.location.origin,
              autoplay: autoplayModeRef.current !== 'off' ? 1 : 0,
            },
            events: {
              onStateChange: e => onPlayerStateChangeRef.current(e),
              onError: e => onPlayerErrorRef.current(e),
              onReady: () => { },
            },
          });
        }
      } else if (playerRef.current && typeof playerRef.current.stopVideo === 'function') {
        playerRef.current.stopVideo();
      }
    };
    managePlayer();
  }, [videoId]);

  useEffect(() => {
    if (isTheaterMode) {
      const playerIframe = document.querySelector('#youtube-player-container iframe');
      if (playerIframe) {
        (playerIframe as HTMLElement).style.width = '100%';
        (playerIframe as HTMLElement).style.height = '100%';
      }
    }
  }, [isTheaterMode]);

  const parsedIframeContent = useMemo(() => {
    if (!article?.content || !article.hasIframe) return { playerHtml: '', descriptionHtml: '' };
    try {
      const doc = new DOMParser().parseFromString(article.content, 'text/html');
      const iframe = doc.querySelector('iframe');
      const playerHtml = iframe ? iframe.outerHTML : '';
      iframe?.remove();
      let descriptionHtml = doc.body.innerHTML.trim();
      descriptionHtml = descriptionHtml
        .replace(/^(<br\s*\/?>\s*|<img[^>]*>\s*)+|(<br\s*\/?>\s*)+$/g, '')
        .trim()
        .replace(/^-/, '')
        .trim();
      descriptionHtml = setLinksToOpenInNewTab(descriptionHtml);
      return { playerHtml, descriptionHtml };
    } catch (e) {
      console.error('Failed to parse iframe content in modal:', e);
      const iframeMatch = article.content.match(/<iframe[\s\S]*?<\/iframe>/s);
      const playerHtml = iframeMatch ? iframeMatch[0] : '';
      let descriptionHtml = article.content.replace(playerHtml, '').trim();
      descriptionHtml = setLinksToOpenInNewTab(descriptionHtml);
      return { playerHtml, descriptionHtml };
    }
  }, [article]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node))
        setIsDropdownOpen(false);
      if (copyDropdownRef.current && !copyDropdownRef.current.contains(event.target as Node))
        setIsCopyDropdownOpen(false);
      if (
        downloadDropdownRef.current &&
        !downloadDropdownRef.current.contains(event.target as Node)
      )
        setIsDownloadDropdownOpen(false);
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

  // Move useMemo hooks before early return to satisfy React Hooks rules
  const isImageInContent = useMemo(() => {
    if (!article || !article.imageUrl || !(article.content || article.description)) return false;
    try {
      let mainImageUrl: URL;
      try {
        mainImageUrl = new URL(article.imageUrl);
      } catch {
        return (article.content || article.description).includes(article.imageUrl);
      }
      const mainImageBaseUrl = mainImageUrl.origin + mainImageUrl.pathname;
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = article.content || article.description;
      const imagesInContent = tempDiv.querySelectorAll('img');
      for (const img of imagesInContent) {
        if (!img.src) continue;
        try {
          const contentImageUrl = new URL(img.src, article.link || window.location.href);
          const contentImageBaseUrl = contentImageUrl.origin + contentImageUrl.pathname;
          if (contentImageBaseUrl === mainImageBaseUrl) return true;
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      console.warn('Could not parse image URLs for comparison, falling back to string check.', e);
      return (article.content || article.description).includes(article.imageUrl);
    }
    return false;
  }, [article]);

  const summaryToDisplay = useMemo(() => {
    if (displayStructuredSummary) return displayStructuredSummary;
    if (displaySummary) return { overallSummary: displaySummary, sections: [] };
    return null;
  }, [displaySummary, displayStructuredSummary]);

  if (!article) return null;

  const isRead = readArticleIds.has(article.id);
  const isReadLater = readLaterArticleIds.has(article.id);

  const shouldShowImage = article.imageUrl && !videoId && !article.hasIframe && !isImageInContent;

  let summaryTooltipText: string;
  if (isSummarizing) summaryTooltipText = 'Generating...';
  else if (summary || structuredSummary) summaryTooltipText = 'Regenerate Summary';
  else if (canSummarize) summaryTooltipText = 'Generate AI Summary';
  else summaryTooltipText = 'Not enough content to summarize';

  const handleToggleAutoscroll = (shouldBeActive: boolean) => {
    setIsAutoscrollActive(shouldBeActive);
    if (shouldBeActive && activeTranscriptIndex !== null && lineRefs.current[activeTranscriptIndex])
      lineRefs.current[activeTranscriptIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
  };

  const handleTimestampClick = (seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, true);
      playerRef.current.playVideo();
    }
  };

  const currentOption = dropdownOptions.find(opt => opt.id === activeTab);
  const showLoadingDetails = article.isVideo && !article.content;

  const generateMarkdownForSummary = (): string => {
    if (!summaryToDisplay) return '';
    let markdown = `## Summary\n${summaryToDisplay.overallSummary}\n\n`;
    if (summaryToDisplay.sections && summaryToDisplay.sections.length > 0) {
      markdown += `## Key Moments\n`;
      markdown +=
        summaryToDisplay.sections
          .map(
            section =>
              `- **${formatTranscriptTime(section.timestamp)} - ${section.title}**: ${section.summary}`
          )
          .join('\n') + '\n\n';
    }
    if (article?.sources && article.sources.length > 0) {
      markdown += `**Sources:**\n`;
      markdown +=
        article.sources
          .map(source => `- [${source.title || source.uri}](${source.uri})`)
          .join('\n') + '\n\n';
    }
    if (article?.link) {
      markdown += `\n\n---\n\n**Original Source:** [${article.title}](${article.link})`;
    }
    return markdown;
  };

  const generateHtmlForSummary = (): string => {
    if (!summaryToDisplay) return '';
    let html = `<h2>Summary</h2><p>${summaryToDisplay.overallSummary.replace(/\n/g, '<br>')}</p>`;
    if (summaryToDisplay.sections && summaryToDisplay.sections.length > 0) {
      html += `<h2>Key Moments</h2><ul>`;
      html += summaryToDisplay.sections
        .map(
          section =>
            `<li><strong>${formatTranscriptTime(section.timestamp)} - ${section.title}</strong>: ${section.summary}</li>`
        )
        .join('');
      html += `</ul>`;
    }
    if (article?.sources && article.sources.length > 0) {
      html += `<p><strong>Sources:</strong></p><ul>`;
      html += article.sources
        .map(
          source =>
            `<li><a href="${source.uri}" target="_blank" rel="noopener noreferrer">${source.title || source.uri}</a></li>`
        )
        .join('');
      html += `</ul>`;
    }
    if (article?.link) {
      html += `<hr><p><strong>Original Source:</strong> <a href="${article.link}" target="_blank" rel="noopener noreferrer">${article.title}</a></p>`;
    }
    return html;
  };

  const handleCopySummary = async (format: 'markdown' | 'html') => {
    setIsCopyDropdownOpen(false);
    try {
      if (format === 'markdown') {
        const markdown = generateMarkdownForSummary();
        await navigator.clipboard.writeText(markdown);
      } else {
        // html
        const html = generateHtmlForSummary();
        const blob = new Blob([html], { type: 'text/html' });
        const clipboardItem = new ClipboardItem({ 'text/html': blob });
        await navigator.clipboard.write([clipboardItem]);
      }
      setCopyStatus('copied');
    } catch (err) {
      console.error('Failed to copy summary: ', err);
      setCopyStatus('error');
    }
  };

  return (
    <div
      ref={modalRef}
      className={`${isTheaterMode ? 'bg-black' : 'bg-gray-800'} fixed inset-0 z-50 shadow-2xl flex flex-col overflow-hidden`}
      tabIndex={-1}
      onClick={e => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {!isTheaterMode && (
        <header
          className={`p-4 border-b border-gray-700 flex-shrink-0 flex flex-col md:flex-row md:items-start gap-2 md:gap-4`}
        >
          {' '}
          <div className="flex-1 min-w-0 order-2 md:order-1">
            {' '}
            <h2 className="text-lg md:text-xl font-bold text-white">{article.title}</h2>
            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {article.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs font-medium bg-gray-700 text-gray-300 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {keywords.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-xs font-semibold text-gray-500">Keywords:</span>
                {keywords.map(keywordObj => (
                  <button
                    key={keywordObj.keyword}
                    onClick={e => {
                      e.stopPropagation();
                      handleKeywordClick(keywordObj);
                    }}
                    className="px-2 py-0.5 text-xs font-medium bg-gray-600 text-gray-200 rounded-full hover:bg-indigo-600 hover:text-white transition-colors"
                  >
                    {keywordObj.keyword}
                  </button>
                ))}
              </div>
            )}
            <div className="text-sm text-gray-400 mt-1 flex items-center flex-wrap gap-x-3 gap-y-1">
              {' '}
              <button
                onClick={handleNavigateToFeed}
                className="hover:underline text-left"
                title={`Go to ${article.feedTitle} feed`}
              >
                {' '}
                {article.feedTitle}{' '}
              </button>{' '}
              <div className="flex items-center gap-1" title="Published Date">
                <CalendarIcon className="w-3 h-3" />
                <span>{formatRelativeDate(article.pubDateTimestamp)}</span>
              </div>{' '}
              {article.isVideo && article.duration != null && (
                <div
                  className="flex items-center gap-1 text-indigo-400 font-medium"
                  title="Duration"
                >
                  <ClockIcon className="w-3 h-3" />
                  <span>{formatTranscriptTime(article.duration)}</span>
                </div>
              )}{' '}
              {article.views != null && (
                <>
                  <span className="hidden sm:inline">&bull;</span>
                  <span className="flex items-center gap-1">
                    <EyeIcon className="w-4 h-4" /> {formatViews(article.views)}
                  </span>
                </>
              )}{' '}
            </div>{' '}
          </div>{' '}
          <div className="w-full md:w-auto flex-shrink-0 flex items-center justify-between order-1 md:order-2">
            {' '}
            <div className="md:hidden w-6 h-6"></div>{' '}
            <div className="flex items-center gap-2">
              {' '}
              <button
                onClick={articleNavigation.onPreviousArticle}
                onTouchStart={e => e.stopPropagation()}
                disabled={!articleNavigation.hasPreviousArticle}
                title="Previous Article (Left Arrow)"
                className="p-1 rounded-full text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeftIcon className="w-6 h-6" />
              </button>{' '}
              <button
                onClick={articleNavigation.onNextArticle}
                onTouchStart={e => e.stopPropagation()}
                disabled={!articleNavigation.hasNextArticle}
                title="Next Article (Right Arrow)"
                className="p-1 rounded-full text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRightIcon className="w-6 h-6" />
              </button>{' '}
              {videoId && !isMobileLayout && (
                <button
                  onClick={() => setIsTheaterMode(true)}
                  onTouchStart={e => e.stopPropagation()}
                  title="Theater Mode"
                  className="text-gray-400 hover:text-white p-1"
                >
                  <MaximizeIcon className="w-5 h-5" />
                </button>
              )}{' '}
              <button
                onClick={handleClose}
                onTouchStart={e => e.stopPropagation()}
                title="Close (Esc)"
                className="text-gray-400 hover:text-white p-1"
              >
                <XIcon className="w-6 h-6" />
              </button>{' '}
            </div>{' '}
          </div>{' '}
        </header>
      )}
      <div className={`flex-grow flex min-h-0 ${isMobileLayout ? 'flex-col' : 'flex-row'}`}>
        <div className="flex-grow flex flex-col min-h-0 min-w-0 relative">
          <div
            className={`flex-grow overflow-y-auto ${isMobileLayout || isTheaterMode ? 'h-full' : ''}`}
          >
            {isTheaterMode && (
              <div className="absolute top-2 right-2 z-20 flex items-center gap-2 bg-black/50 p-2 rounded-lg">
                {' '}
                <button
                  onClick={() => setIsTheaterMode(false)}
                  onTouchStart={e => e.stopPropagation()}
                  title="Exit Theater Mode"
                  className="text-white hover:text-indigo-400 p-1"
                >
                  {' '}
                  <RestoreIcon className="w-6 h-6" />{' '}
                </button>{' '}
                <button
                  onClick={handleClose}
                  onTouchStart={e => e.stopPropagation()}
                  title="Close (Esc)"
                  className="text-white hover:text-indigo-400 p-1"
                >
                  {' '}
                  <XIcon className="w-6 h-6" />{' '}
                </button>{' '}
              </div>
            )}
            {videoId || article.hasIframe ? (
              <div
                ref={videoPlayerContainerRef}
                className={`bg-black w-full relative ${isTheaterMode ? 'h-full aspect-auto' : isMobileLayout ? 'aspect-video' : 'h-full'}`}
              >
                {' '}
                {videoId && (
                  <div id="youtube-player-container" className="w-full h-full"></div>
                )}{' '}
                {article.hasIframe && !videoId && (
                  <div
                    className="w-full h-full"
                    dangerouslySetInnerHTML={{ __html: parsedIframeContent.playerHtml }}
                  />
                )}{' '}
              </div>
            ) : (
              <div
                className="article-content-area flex-grow overflow-y-auto px-6 pt-4 pb-12 h-full overflow-x-hidden"
                onTouchStart={() => { }}
              >
                {' '}
                {shouldShowImage && (
                  <img
                    src={article.imageUrl!}
                    alt={article.title}
                    className="w-full max-w-2xl mx-auto h-auto object-cover rounded-lg mb-6 shadow-lg"
                  />
                )}{' '}
                {showLoadingDetails ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-gray-400 h-full">
                    {' '}
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-3"></div>{' '}
                    <p className="font-semibold">Loading full video details...</p>{' '}
                  </div>
                ) : (
                  <div
                    className="prose prose-invert max-w-none prose-p:text-gray-300 prose-headings:text-gray-100 prose-a:text-indigo-400 prose-strong:text-gray-200"
                    dangerouslySetInnerHTML={{ __html: processedContentForDisplay }}
                  />
                )}{' '}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 p-2 border-t border-gray-700 bg-gray-800/80 flex justify-center items-center gap-2 flex-wrap">
            <Tooltip text={isRead ? 'Mark as Unread' : 'Mark as Read'} isMobile={isTouchDevice}>
              <button
                onClick={() => article && handleToggleReadStatus(article.id)}
                className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"
              >
                <span className="sr-only">{isRead ? 'Unread' : 'Read'}</span>
                {isRead ? (
                  <CheckCircleIcon className="w-5 h-5 text-indigo-400" />
                ) : (
                  <EyeIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                )}
              </button>
            </Tooltip>
            <Tooltip
              text={isReadLater ? 'Remove from Read Later' : 'Save for Read Later'}
              isMobile={isTouchDevice}
            >
              <button
                onClick={() => article && handleToggleReadLater(article.id)}
                className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"
              >
                <span className="sr-only">{isReadLater ? 'Saved' : 'Save'}</span>
                <BookmarkIcon
                  className={`w-5 h-5 ${isReadLater ? 'fill-current text-indigo-400' : 'text-gray-400 hover:text-white'}`}
                />
              </button>
            </Tooltip>
            <Tooltip text="Tag this article" isMobile={isTouchDevice}>
              <button
                onClick={() => setArticleToEditTags(article)}
                className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"
              >
                <TagIcon className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </Tooltip>
            <Tooltip text="Remove Article" isMobile={isTouchDevice}>
              <button
                onClick={() => article && handleRemoveArticle(article.id, article.feedId)}
                className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"
              >
                <span className="sr-only">Remove Article</span>
                <TrashIcon className="w-5 h-5 text-gray-400 hover:text-red-400" />
              </button>
            </Tooltip>
            {videoId && (
              <>
                {' '}
                <Tooltip text={isLiked ? 'Liked' : 'Like on YouTube'} isMobile={isTouchDevice}>
                  <button
                    onClick={handleLikeClick}
                    disabled={isLiked || !videoId}
                    className="p-2.5 rounded-md transition-colors hover:bg-gray-700 flex-1 flex justify-center items-center disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">{isLiked ? 'Liked' : 'Like'}</span>
                    <LikeIcon
                      className={`w-5 h-5 ${isLiked ? 'fill-current text-indigo-400' : 'text-gray-400 hover:text-white disabled:text-gray-600'}`}
                    />
                  </button>
                </Tooltip>{' '}
                <div className="relative" ref={downloadDropdownRef}>
                  {' '}
                  <Tooltip text="Download" isMobile={isTouchDevice}>
                    <button
                      onClick={() => setIsDownloadDropdownOpen(prev => !prev)}
                      className="p-2.5 rounded-md transition-colors hover:bg-gray-700 flex-1 flex justify-center items-center disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Download</span>
                      <DownloadIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                    </button>
                  </Tooltip>{' '}
                  {isDownloadDropdownOpen && (
                    <div className="absolute bottom-full mb-2 w-max bg-gray-700 rounded-md shadow-lg z-20 p-1 border border-gray-600">
                      {' '}
                      {audioDownloadUrl && (
                        <a
                          href={audioDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-indigo-600 text-sm text-gray-200"
                        >
                          <MusicIcon className="w-4 h-4" />
                          <span>Audio (opus)</span>
                        </a>
                      )}{' '}
                      {video1080pDownloadUrl && (
                        <a
                          href={video1080pDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-indigo-600 text-sm text-gray-200"
                        >
                          <VideoIcon className="w-4 h-4" />
                          <span>Video (1080p)</span>
                        </a>
                      )}{' '}
                      {video360pDownloadUrl && (
                        <a
                          href={video360pDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-indigo-600 text-sm text-gray-200"
                        >
                          <VideoIcon className="w-4 h-4" />
                          <span>Audio+Video (360p)</span>
                        </a>
                      )}{' '}
                    </div>
                  )}{' '}
                </div>{' '}
                <Tooltip text="Autoplay next" isMobile={isTouchDevice}>
                  <button
                    onClick={handleToggleAutoplayNext}
                    className="p-2.5 rounded-md transition-colors hover:bg-gray-700 flex-1 flex justify-center items-center"
                  >
                    <span className="sr-only">Autoplay Next</span>
                    <SkipForwardIcon
                      className={`w-5 h-5 ${autoplayMode === 'on' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`}
                    />
                  </button>
                </Tooltip>{' '}
                <Tooltip text="Autoplay random" isMobile={isTouchDevice}>
                  <button
                    onClick={handleToggleAutoplayRandom}
                    className="p-2.5 rounded-md transition-colors hover:bg-gray-700 flex-1 flex justify-center items-center"
                  >
                    <span className="sr-only">Autoplay Random</span>
                    <ShuffleIcon
                      className={`w-5 h-5 ${autoplayMode === 'random' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`}
                    />
                  </button>
                </Tooltip>{' '}
                <Tooltip text="Repeat" isMobile={isTouchDevice}>
                  <button
                    onClick={handleToggleAutoplayRepeat}
                    className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"
                  >
                    <span className="sr-only">Repeat</span>
                    <RepeatIcon
                      className={`w-5 h-5 ${autoplayMode === 'repeat' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`}
                    />
                  </button>
                </Tooltip>{' '}
              </>
            )}
            {article.link && (
              <Tooltip text="Open Original" isMobile={isTouchDevice}>
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"
                >
                  <span className="sr-only">Open Original</span>
                  <ExternalLinkIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                </a>
              </Tooltip>
            )}
            <Tooltip text={summaryTooltipText} isMobile={isTouchDevice}>
              <button
                onClick={handleSummarizeContent}
                disabled={isSummarizing || !canSummarize}
                className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center disabled:cursor-not-allowed"
              >
                <span className="sr-only">
                  {isSummarizing
                    ? 'Generating...'
                    : summary || structuredSummary
                      ? 'Regenerate'
                      : 'Generate Summary'}
                </span>
                <SparklesIcon
                  className={`w-5 h-5 ${isSummarizing ? 'animate-pulse text-indigo-400' : 'text-gray-400 hover:text-white disabled:text-gray-600'}`}
                />
              </button>
            </Tooltip>
          </div>
          {isPanelMinimized && !isMobileLayout && !isTheaterMode && (
            <div className="absolute top-0 right-0 h-full flex items-center z-10">
              {' '}
              <Tooltip text="Show Panel" isMobile={isTouchDevice}>
                {' '}
                <button
                  onClick={() => setIsPanelMinimized(false)}
                  className="mr-1 p-1 rounded-full bg-gray-700/80 hover:bg-indigo-600 text-gray-300 hover:text-white transition-all shadow-lg"
                  aria-label="Show Panel"
                >
                  {' '}
                  <ChevronLeftIcon className="w-5 h-5" />{' '}
                </button>{' '}
              </Tooltip>{' '}
            </div>
          )}
        </div>
        {(isMobileLayout || (!isTheaterMode && !isPanelMinimized)) && (
          <div
            className={`flex-shrink-0 bg-gray-800/50 flex flex-col ${isMobileLayout ? 'border-t-2 border-gray-700' : 'min-h-0 w-1/3 border-l-2 border-gray-700'}`}
            style={
              isMobileLayout ? { height: isMobilePanelMinimized ? 'auto' : `${panelHeight}px` } : {}
            }
          >
            {isMobileLayout && (
              <div
                onMouseDown={!isMobilePanelMinimized ? handlePanelResizeStart : undefined}
                onTouchStart={!isMobilePanelMinimized ? handlePanelResizeStart : undefined}
                onDoubleClick={toggleMobilePanel}
                className={`flex-shrink-0 h-8 bg-gray-700 hover:bg-indigo-500 transition-colors ${!isMobilePanelMinimized ? 'cursor-row-resize' : 'cursor-pointer'} w-full flex items-center justify-center`}
              >
                {' '}
                {isMobilePanelMinimized ? (
                  <ChevronUpIcon className="w-6 h-6 text-gray-400" />
                ) : (
                  <ChevronDownIcon className="w-6 h-6 text-gray-400" />
                )}{' '}
              </div>
            )}
            {(!isMobileLayout || !isMobilePanelMinimized) && (
              <>
                {' '}
                <div className="flex-shrink-0 p-3 border-b border-gray-700 flex items-center justify-between gap-2">
                  {' '}
                  <div className="relative flex-grow" ref={dropdownRef}>
                    {' '}
                    <button
                      onClick={() => setIsDropdownOpen(prev => !prev)}
                      onTouchStart={e => e.stopPropagation()}
                      className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors"
                    >
                      {' '}
                      <div className="flex items-center gap-2">
                        {' '}
                        {currentOption && (
                          <currentOption.icon className="w-5 h-5 text-indigo-400" />
                        )}{' '}
                        <span className="font-semibold text-gray-200">
                          {currentOption?.label}
                        </span>{' '}
                      </div>{' '}
                      <ChevronDownIcon
                        className={`w-5 h-5 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                      />{' '}
                    </button>{' '}
                    {isDropdownOpen && (
                      <div className="absolute top-full mt-1 w-full bg-gray-700 rounded-md shadow-lg z-20 p-1 border border-gray-600">
                        {' '}
                        {dropdownOptions.map(option => (
                          <button
                            key={option.id}
                            onClick={() => {
                              setActiveTab(option.id);
                              setIsDropdownOpen(false);
                            }}
                            className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-indigo-600 text-sm text-gray-200"
                          >
                            {' '}
                            <option.icon className="w-5 h-5" /> <span>{option.label}</span>{' '}
                          </button>
                        ))}{' '}
                      </div>
                    )}{' '}
                  </div>{' '}
                  {!isMobileLayout && (
                    <Tooltip text="Hide Panel" isMobile={isTouchDevice}>
                      {' '}
                      <button
                        onClick={() => setIsPanelMinimized(true)}
                        className="p-1.5 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white flex-shrink-0"
                        aria-label="Hide Panel"
                      >
                        {' '}
                        <ChevronRightIcon className="w-5 h-5" />{' '}
                      </button>{' '}
                    </Tooltip>
                  )}{' '}
                </div>
                <div
                  className="flex-grow overflow-y-auto p-4 article-content-area overflow-x-hidden"
                  onScroll={handleManualScroll}
                  ref={transcriptContainerRef}
                >
                  {activeTab === 'summary' &&
                    (() => {
                      if (isSummarizing) {
                        return (
                          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                            <p className="font-semibold">Generating AI Summary...</p>
                            <p className="text-xs">This might take up to a minute.</p>
                          </div>
                        );
                      }
                      if (error) {
                        return (
                          <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm">
                            <p className="font-semibold mb-1">Error generating summary:</p>
                            <p>{error}</p>
                          </div>
                        );
                      }
                      if (!summary && !structuredSummary) {
                        return (
                          <div className="text-center text-gray-500 text-sm py-10">
                            No summary available. Click the{' '}
                            <SparklesIcon className="w-4 h-4 inline-block mx-1" /> icon to generate
                            one.
                          </div>
                        );
                      }
                      return (
                        <div>
                          <div className="flex justify-end items-center gap-2 mb-2">
                            <Tooltip text="Save Summary as Note" isMobile={isTouchDevice}>
                              <button
                                onClick={() => article && handleSaveSummaryAsNote(article)}
                                disabled={!summary && !structuredSummary}
                                className="p-1.5 rounded-md transition-colors bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <SaveIcon className="w-5 h-5 text-gray-300" />
                              </button>
                            </Tooltip>
                            <div className="relative" ref={copyDropdownRef}>
                              <Tooltip text="Copy Summary" isMobile={isTouchDevice}>
                                <button
                                  onClick={() => setIsCopyDropdownOpen(p => !p)}
                                  disabled={!summary && !structuredSummary}
                                  className="p-1.5 rounded-md transition-colors bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {copyStatus === 'idle' && (
                                    <CopyIcon className="w-5 h-5 text-gray-300" />
                                  )}
                                  {copyStatus === 'copied' && (
                                    <ClipboardCheckIcon className="w-5 h-5 text-green-400" />
                                  )}
                                  {copyStatus === 'error' && (
                                    <XIcon className="w-5 h-5 text-red-400" />
                                  )}
                                </button>
                              </Tooltip>
                              {isCopyDropdownOpen && (
                                <div className="absolute top-full right-0 mt-2 w-48 bg-gray-700 rounded-md shadow-lg z-10 border border-gray-600 p-1">
                                  <button
                                    onClick={() => handleCopySummary('html')}
                                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-md text-gray-200 hover:bg-indigo-600 hover:text-white"
                                  >
                                    Copy as Rich Text
                                  </button>
                                  <button
                                    onClick={() => handleCopySummary('markdown')}
                                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-md text-gray-200 hover:bg-indigo-600 hover:text-white"
                                  >
                                    Copy as Markdown
                                  </button>
                                </div>
                              )}
                            </div>
                            <LanguageSelector
                              selectedLanguage={selectedLanguage}
                              onLanguageChange={handleLanguageChange}
                              isTranslating={isTranslating}
                              disabled={!summary && !structuredSummary}
                            />
                          </div>
                          {isTranslating ? (
                            <div className="flex flex-col items-center justify-center pt-10 text-center text-gray-400">
                              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                              <p className="font-semibold">Translating summary...</p>
                            </div>
                          ) : translationError ? (
                            <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm">
                              <p className="font-semibold mb-1">Error during translation:</p>
                              <p>{translationError}</p>
                            </div>
                          ) : summaryToDisplay ? (
                            <>
                              <SummaryRenderer text={summaryToDisplay.overallSummary} />
                              {summaryToDisplay.sections &&
                                summaryToDisplay.sections.length > 0 && (
                                  <div className="mt-4 space-y-3">
                                    {summaryToDisplay.sections.map((section, index) => (
                                      <div
                                        key={index}
                                        className="bg-gray-900/50 p-2 rounded-md cursor-pointer hover:bg-gray-900"
                                        onClick={() => handleTimestampClick(section.timestamp)}
                                      >
                                        <p className="font-semibold text-indigo-400 text-sm">
                                          {formatTranscriptTime(section.timestamp)} -{' '}
                                          {section.title}
                                        </p>
                                        <p className="text-sm text-gray-400 mt-1">
                                          {section.summary}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              {article.sources && article.sources.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-gray-700/50">
                                  <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">
                                    Sources
                                  </h4>
                                  <ul className="space-y-3 text-sm">
                                    {article.sources.map((source, index) => (
                                      <li key={index}>
                                        <a
                                          href={source.uri}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-semibold text-indigo-400 hover:underline hover:text-indigo-300 break-words"
                                          title={source.uri}
                                        >
                                          {index + 1}. {source.title || source.uri}
                                        </a>
                                        {source.description && (
                                          <p className="text-gray-400 mt-1 pl-4">
                                            {source.description}
                                          </p>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-center text-gray-500 text-sm py-10">
                              Summary could not be displayed.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  {activeTab === 'transcript' &&
                    (isFetchingTranscript || isFetchingChoices ? (
                      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                        {' '}
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>{' '}
                        <p className="font-semibold">
                          {isFetchingChoices ? 'Finding transcripts...' : 'Loading transcript...'}
                        </p>{' '}
                      </div>
                    ) : transcriptError ? (
                      <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm">
                        {' '}
                        <p className="font-semibold mb-1">Error loading transcript:</p>{' '}
                        <p>{transcriptError}</p>{' '}
                      </div>
                    ) : transcriptData && transcriptData.transcript.length > 0 ? (
                      <div>
                        {' '}
                        <div className="flex justify-between items-center mb-2 sticky top-0 bg-gray-800 py-2 z-10">
                          {' '}
                          <div className="flex flex-wrap items-center gap-2">
                            {' '}
                            {captionChoices && captionChoices.length > 1 && (
                              <select
                                value={selectedCaptionUrl || ''}
                                onChange={e => setSelectedCaptionUrl(e.target.value)}
                                className="bg-gray-700 text-white text-xs font-semibold py-1 pl-2 pr-6 rounded-md appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              >
                                {' '}
                                {captionChoices.map(c => (
                                  <option key={c.url} value={c.url}>
                                    {c.label}
                                  </option>
                                ))}{' '}
                              </select>
                            )}{' '}
                          </div>{' '}
                          <label
                            htmlFor="autoscroll-toggle"
                            className="flex items-center text-xs text-gray-400 cursor-pointer"
                          >
                            {' '}
                            <input
                              id="autoscroll-toggle"
                              type="checkbox"
                              checked={isAutoscrollActive}
                              onChange={e => handleToggleAutoscroll(e.target.checked)}
                              className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                            />{' '}
                            <span className="ml-2">Autoscroll</span>{' '}
                          </label>{' '}
                        </div>{' '}
                        <div className="space-y-2">
                          {' '}
                          {transcriptData.transcript.map((line, index) => (
                            <div
                              key={index}
                              ref={el => {
                                lineRefs.current[index] = el;
                              }}
                              onClick={() => handleTimestampClick(line.start)}
                              className={`p-2 rounded-md cursor-pointer transition-colors text-sm ${activeTranscriptIndex === index ? 'bg-indigo-500/20' : 'hover:bg-gray-700/50'}`}
                              dir={isRtl(transcriptData.language) ? 'rtl' : 'ltr'}
                            >
                              {' '}
                              <span className="font-mono text-xs text-indigo-400 mr-2">
                                {formatTranscriptTime(line.start)}
                              </span>{' '}
                              <span
                                className={
                                  activeTranscriptIndex === index ? 'text-white' : 'text-gray-300'
                                }
                              >
                                {line.text}
                              </span>{' '}
                            </div>
                          ))}{' '}
                        </div>{' '}
                      </div>
                    ) : null)}
                  {activeTab === 'comments' &&
                    (commentsState.isLoading ? (
                      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                        {' '}
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>{' '}
                        <p className="font-semibold">Loading Comments...</p>{' '}
                      </div>
                    ) : commentsState.error ? (
                      <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm">
                        {' '}
                        <p className="font-semibold mb-1">Error loading comments:</p>{' '}
                        <p>{commentsState.error}</p>{' '}
                      </div>
                    ) : commentsState.comments && commentsState.comments.length > 0 ? (
                      <div className="divide-y divide-gray-700/50">
                        {' '}
                        {commentsState.comments.map(comment => (
                          <CommentItem key={comment.commentId} comment={comment} />
                        ))}{' '}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 text-sm py-10">
                        No comments found or comments are disabled.
                      </div>
                    ))}
                  {activeTab === 'details' &&
                    (showLoadingDetails ? (
                      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                        {' '}
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>{' '}
                        <p className="font-semibold">Loading full video details...</p>{' '}
                      </div>
                    ) : (
                      <div
                        className="prose prose-invert max-w-none prose-p:text-gray-300 prose-headings:text-gray-100 prose-a:text-indigo-400 prose-strong:text-gray-200"
                        dangerouslySetInnerHTML={{
                          __html: article.hasIframe
                            ? parsedIframeContent.descriptionHtml
                            : processedContentForDisplay,
                        }}
                      />
                    ))}
                </div>{' '}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
