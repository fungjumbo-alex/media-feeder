import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, SparklesIcon, ExternalLinkIcon, EyeIcon, BookmarkIcon, CheckCircleIcon, MaximizeIcon, RestoreIcon, ChevronLeftIcon, ChevronRightIcon, LikeIcon, SkipForwardIcon, ShuffleIcon, CommentIcon, ListIcon, RssIcon, ChevronDownIcon, DownloadIcon, VideoIcon, MusicIcon, ChevronUpIcon, TagIcon, TrashIcon, RepeatIcon } from './icons';
import { summarizeText, summarizeYouTubeVideo, fetchAvailableCaptionChoices, fetchAndParseTranscript } from '../services/geminiService';
import { INVIDIOUS_INSTANCES } from '../services/proxyService';
import { getYouTubeId } from '../services/youtubeService';
import type { TranscriptLine, CaptionChoice, StructuredVideoSummary, YouTubeComment } from '../types';
import { formatRelativeDate } from '../utils/dateUtils';

const formatViews = (views: number | null | undefined): string => {
    if (views === null || views === undefined) return '';
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K views`;
    return `${views} views`;
};

const MODAL_STATE_KEY = 'media-feeder-modal-state';
const PANEL_WIDTH_KEY = 'media-feeder-panel-width';
interface StoredModalState { size: { width: number; height: number }; position: { x: number; y: number }; isMaximized: boolean; }

// A promise-based wrapper to ensure the YouTube API is ready, preventing race conditions.
const ensureYouTubeApiReady = (() => {
    let apiReadyPromise: Promise<void> | null = null;
    return () => {
        if (!apiReadyPromise) {
            apiReadyPromise = new Promise((resolve) => {
                // If API is already available, resolve immediately.
                if (window.YT && window.YT.Player) {
                    return resolve();
                }
                // Otherwise, wait for the global callback.
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
    // Don't show hours if it's 00:
    if (timeString.startsWith('00:')) {
        return timeString.substr(3);
    }
    return timeString;
};

// FIX: Add helper function to detect RTL languages for the 'dir' attribute.
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
            <img src={comment.authorThumbnails[0]?.url} alt={comment.author} className="w-8 h-8 rounded-full bg-gray-700" />
            <div className="flex-1">
                <div className="flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-gray-200">{comment.author}</p>
                    <p className="text-xs text-gray-500">{comment.publishedText}</p>
                </div>
                <div className="text-sm text-gray-300 mt-1 prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: comment.contentHtml }} />
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

const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
    return (
        <div className="group relative">
            {children}
            <div className="absolute bottom-full mb-2 w-max max-w-xs px-2 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg left-1/2 -translate-x-1/2">
                {text}
            </div>
        </div>
    );
};


export const ArticleModal: React.FC = () => {
    const {
        selectedArticle: article, handleCloseArticleModal, handleSummaryGenerated, readArticleIds, handleToggleReadStatus,
        readLaterArticleIds, handleToggleReadLater, likedVideoIds, handleLikeVideo, articleNavigation,
        aiModel, autoplayMode, handleToggleAutoplayNext, handleToggleAutoplayRandom, handleToggleAutoplayRepeat, articlesForNavigation,
        commentsState, handleFetchComments, handleFetchArticleDetails, handleOpenArticle,
        feeds,
        handleViewChange,
        autoLikeYouTubeVideos,
        autoLikeDelaySeconds,
        setArticleToEditTags,
        handleRemoveArticle,
    } = useAppContext();

    const [summary, setSummary] = useState<string | null>(null);
    const [structuredSummary, setStructuredSummary] = useState<StructuredVideoSummary | null>(null);
    const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
    const summaryPendingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizingDirection, setResizingDirection] = useState<string | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [previousState, setPreviousState] = useState<Omit<StoredModalState, 'isMaximized'> | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const videoPlayerContainerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number; y: number; width: number; height: number; posX: number; posY: number; } | null>(null);
    const isInitializedRef = useRef(false);
    const geometryRef = useRef({ size, position });
    const modalStateRef = useRef({ isMaximized, previousState });
    const resizeEndTimestampRef = useRef(0);
    const touchStartRef = useRef<{ x: number, isInsideVideo: boolean } | null>(null);
    const touchEndRef = useRef<number | null>(null);
    const minSwipeDistance = 50;
    const [transcriptData, setTranscriptData] = useState<{ transcript: TranscriptLine[]; language: string | undefined } | null>(null);
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
    const [panelWidth, setPanelWidth] = useState<number>(0);
    const [isColumnResizing, setIsColumnResizing] = useState(false);
    const columnResizeStartRef = useRef<{ x: number; initialWidth: number } | null>(null);
    const rightPanelRef = useRef<HTMLDivElement>(null);
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
    const [isPanelMinimized, setIsPanelMinimized] = useState(false);
    const [isMobilePanelMinimized, setIsMobilePanelMinimized] = useState(false);


    // YouTube Player State
    const playerRef = useRef<YT.Player | null>(null);
    const autoplayModeRef = useRef(autoplayMode);
    useEffect(() => { autoplayModeRef.current = autoplayMode; }, [autoplayMode]);
    const navigationRef = useRef(articleNavigation);
    useEffect(() => { navigationRef.current = articleNavigation; }, [articleNavigation]);
    const articlesForNavigationRef = useRef(articlesForNavigation);
    useEffect(() => { articlesForNavigationRef.current = articlesForNavigation; }, [articlesForNavigation]);
    const currentArticleRef = useRef(article);
    useEffect(() => { currentArticleRef.current = article; }, [article]);
    const transcriptRef = useRef(transcriptData);
    useEffect(() => { transcriptRef.current = transcriptData; }, [transcriptData]);
    const handleOpenArticleRef = useRef(handleOpenArticle);
    useEffect(() => { handleOpenArticleRef.current = handleOpenArticle; }, [handleOpenArticle]);


    useEffect(() => { geometryRef.current = { size, position }; }, [size, position]);
    useEffect(() => { modalStateRef.current = { isMaximized, previousState }; }, [isMaximized, previousState]);

    const handleClose = useCallback(() => {
        window.speechSynthesis.cancel();
        if (!isMobileLayout) {
            const { isMaximized: currentIsMaximized, previousState: currentPreviousState } = modalStateRef.current;
            const currentGeometry = geometryRef.current;
            if (currentGeometry.size.width > 0) {
                const stateToSave: StoredModalState = {
                    size: (currentIsMaximized && currentPreviousState) ? currentPreviousState.size : currentGeometry.size,
                    position: (currentIsMaximized && currentPreviousState) ? currentPreviousState.position : currentGeometry.position,
                    isMaximized: currentIsMaximized,
                };
                localStorage.setItem(MODAL_STATE_KEY, JSON.stringify(stateToSave));
                localStorage.setItem(PANEL_WIDTH_KEY, panelWidth.toString());
            }
        }
        handleCloseArticleModal();
    }, [handleCloseArticleModal, isMobileLayout, panelWidth]);

    const toggleMaximize = useCallback(() => {
        const wasMaximized = isMaximized;
        setIsMaximized(prev => !prev);
    
        if (wasMaximized) {
            // Restoring from maximized
            if (previousState) {
                setSize(previousState.size);
                setPosition(previousState.position);
                setPreviousState(null);
                
                // Restore panel width to what it was before maximizing, or a sensible default.
                const storedPanelWidth = localStorage.getItem(PANEL_WIDTH_KEY);
                const { clientWidth } = document.documentElement;
                const defaultPanelWidth = Math.max(350, Math.min(clientWidth / 5, 600));
                setPanelWidth(storedPanelWidth ? parseInt(storedPanelWidth, 10) : defaultPanelWidth);
            }
        } else {
            // Maximizing
            setPreviousState({ size, position });
            const { clientWidth, clientHeight } = document.documentElement;
            setSize({ width: clientWidth, height: clientHeight });
            setPosition({ x: 0, y: 0 });
    
            // Set panel width specifically for maximized view.
            const maximizedPanelWidth = clientWidth / 5;
            setPanelWidth(maximizedPanelWidth);
        }
    }, [isMaximized, previousState, size, position]);
    
    useEffect(() => { 
        return () => { 
            // The main player destruction is now handled by the unmount effect,
            // but we still cancel speech synthesis here for safety.
            window.speechSynthesis.cancel();
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        };
    }, []);

    const togglePanelMinimized = useCallback(() => {
        // This action is only for desktop/non-theater mode where the panel is on the side.
        if (isMobileLayout || isTheaterMode) return;
        setIsPanelMinimized(prev => !prev);
    }, [isMobileLayout, isTheaterMode]);

    const toggleMobilePanel = useCallback(() => {
        setIsMobilePanelMinimized(p => !p);
    }, []);

    const videoId = useMemo(() => getYouTubeId(article?.link ?? null), [article]);
    const showDetailsTab = article?.hasIframe || (videoId && article?.description);
    const hasTranscript = !!transcriptData?.transcript && transcriptData.transcript.length > 0;
    
    // Find the feed for the current article to get playlist-specific info
    const currentFeed = useMemo(() => {
        if (!article) return null;
        return feeds.find(f => f.id === article.feedId);
    }, [feeds, article]);

    const channelLinkUrl = (currentFeed?.isPlaylist && currentFeed.channelUrl)
        ? currentFeed.channelUrl
        : article?.feedId;

    const handleNavigateToFeed = () => {
        if (channelLinkUrl) {
            handleViewChange('feed', channelLinkUrl);
        }
    };

    useEffect(() => {
        if (videoId && INVIDIOUS_INSTANCES.length > 0) {
            // itag=251 is for opus audio. itag=140 is for m4a. opus is generally better.
            setAudioDownloadUrl(`${INVIDIOUS_INSTANCES[0]}/latest_version?id=${videoId}&itag=251`);
            // itag=137 is for 1080p video only.
            setVideo1080pDownloadUrl(`${INVIDIOUS_INSTANCES[0]}/latest_version?id=${videoId}&itag=137`);
            // itag=18 is for 360p video with audio.
            setVideo360pDownloadUrl(`${INVIDIOUS_INSTANCES[0]}/latest_version?id=${videoId}&itag=18`);
        } else {
            setAudioDownloadUrl(null);
            setVideo1080pDownloadUrl(null);
            setVideo360pDownloadUrl(null);
        }
    }, [videoId]);

    const dropdownOptions = useMemo(() => {
        const options: { id: ActiveTab; label: string; icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
            { id: 'summary', label: 'AI Summary', icon: SparklesIcon },
        ];
        if (hasTranscript) {
            options.push({ id: 'transcript', label: 'Transcript', icon: ListIcon });
        }
        if (showDetailsTab) {
            options.push({ id: 'details', label: 'Details', icon: RssIcon });
        }
        if (videoId) {
            options.push({ id: 'comments', label: 'Comments', icon: CommentIcon });
        }
        return options;
    }, [hasTranscript, showDetailsTab, videoId]);

    useEffect(() => {
        const availableTabs = new Set(dropdownOptions.map(opt => opt.id));
        if (!availableTabs.has(activeTab)) {
            setActiveTab(showDetailsTab ? 'details' : 'summary');
        }
    }, [activeTab, dropdownOptions, showDetailsTab]);
    
    useEffect(() => {
        if (article && !isInitializedRef.current) {
            const storedStateJSON = localStorage.getItem(MODAL_STATE_KEY);
            let storedState: StoredModalState | null = null;
            try { if (storedStateJSON) storedState = JSON.parse(storedStateJSON); } catch (e) { console.error("Failed to parse modal state", e); }

            const { clientWidth, clientHeight } = document.documentElement;
            const isMobile = clientWidth < 768;
            setIsMobileLayout(isMobile);

            if (isMobile) {
                setSize({ width: clientWidth, height: clientHeight });
                setPosition({ x: 0, y: 0 });
                setPanelHeight(clientHeight * 0.5);
            } else {
                setPanelHeight(0);
                if (storedState) {
                    if (storedState.isMaximized) {
                        setSize({ width: clientWidth, height: clientHeight }); 
                        setPosition({ x: 0, y: 0 });
                        setPreviousState({ size: storedState.size, position: storedState.position });
                        setIsMaximized(true);
                    } else { 
                        setSize(storedState.size); 
                        setPosition(storedState.position); 
                        setIsMaximized(false); 
                    }
                } else {
                    const width = Math.max(Math.min(clientWidth * 0.95, 1400), 450);
                    const height = clientHeight * 0.9;
                    setSize({ width, height }); 
                    setPosition({ x: (clientWidth - width) / 2, y: (clientHeight - height) / 2 }); 
                    setIsMaximized(false);
                }
                
                const storedPanelWidth = localStorage.getItem(PANEL_WIDTH_KEY);
                // Default to 1/5 of screen width with min/max constraints.
                const defaultPanelWidth = Math.max(350, Math.min(clientWidth / 5, 600));
                setPanelWidth(storedPanelWidth ? parseInt(storedPanelWidth, 10) : defaultPanelWidth);
            }
            isInitializedRef.current = true;
        }
        if (!article) {
            isInitializedRef.current = false;
            lastArticleIdRef.current = null; // Clear ref when modal closes
        }

        if (article && article.id !== lastArticleIdRef.current) { 
            modalRef.current?.querySelector('.article-content-area')?.scrollTo(0, 0); 
            setTranscriptData(null); 
            setIsFetchingTranscript(false); 
            setTranscriptError(null); 
            setActiveTranscriptIndex(null); 
            setIsAutoscrollActive(true); 
            const newDefaultTab: ActiveTab = showDetailsTab ? 'details' : 'summary';
            setActiveTab(newDefaultTab);
            setIsTheaterMode(false); 
            setCaptionChoices(null);
            setSelectedCaptionUrl(null);
            setIsFetchingChoices(false);
            if (videoId) {
                handleFetchComments(videoId);
            }
            if (article.isVideo && !article.content) {
                handleFetchArticleDetails(article.id);
            }
        }
        
        if (article) {
            lastArticleIdRef.current = article.id;
        }
        
        window.speechSynthesis.cancel();
    }, [article, videoId, handleFetchComments, showDetailsTab, handleFetchArticleDetails]);
    
    const handleInteractionStart = (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>, type: 'drag' | 'resize', direction?: string) => {
        e.stopPropagation(); if (type === 'drag' && ((e.target as HTMLElement).closest('button, a, input, .no-drag') || isMaximized || isMobileLayout)) return;
        if (e.cancelable) e.preventDefault(); const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX; const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        if (type === 'drag') setIsDragging(true); else { setIsResizing(true); setResizingDirection(direction!); }
        dragStartRef.current = { x: clientX, y: clientY, width: size.width, height: size.height, posX: position.x, posY: position.y };
        document.body.style.userSelect = 'none';
    };

    const handleInteractionMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!dragStartRef.current) return; if (e instanceof TouchEvent && e.cancelable) e.preventDefault();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX; const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const dx = clientX - dragStartRef.current.x; const dy = clientY - dragStartRef.current.y;
        if (isDragging) { setPosition({ x: dragStartRef.current.posX + dx, y: dragStartRef.current.posY + dy }); } else if (isResizing && resizingDirection) {
            let newWidth = dragStartRef.current.width, newHeight = dragStartRef.current.height, newX = dragStartRef.current.posX, newY = dragStartRef.current.posY;
            const minWidth = 450, minHeight = 400;
            if (resizingDirection.includes('e')) newWidth = Math.max(minWidth, dragStartRef.current.width + dx);
            if (resizingDirection.includes('w')) { const w = dragStartRef.current.width - dx; if (w >= minWidth) { newWidth = w; newX = dragStartRef.current.posX + dx; } }
            if (resizingDirection.includes('s')) newHeight = Math.max(minHeight, dragStartRef.current.height + dy);
            if (resizingDirection.includes('n')) { const h = dragStartRef.current.height - dy; if (h >= minHeight) { newHeight = h; newY = dragStartRef.current.posY + dy; } }
            setSize({ width: newWidth, height: newHeight }); setPosition({ x: newX, y: newY });
        }
    }, [isDragging, isResizing, resizingDirection]);

    const handleInteractionEnd = useCallback(() => { if (isResizing) resizeEndTimestampRef.current = Date.now(); setIsDragging(false); setIsResizing(false); setResizingDirection(null); dragStartRef.current = null; document.body.style.userSelect = ''; }, [isResizing]);

    useEffect(() => {
        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleInteractionMove); window.addEventListener('mouseup', handleInteractionEnd);
            window.addEventListener('touchmove', handleInteractionMove, { passive: false }); window.addEventListener('touchend', handleInteractionEnd);
        }
        return () => { window.removeEventListener('mousemove', handleInteractionMove); window.removeEventListener('mouseup', handleInteractionEnd); window.removeEventListener('touchmove', handleInteractionMove); window.removeEventListener('touchend', handleInteractionEnd); };
    }, [isDragging, isResizing, handleInteractionMove, handleInteractionEnd]);

    const handlePanelResizeStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsPanelResizing(true);
        const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        panelResizeStartRef.current = { y: startY, initialHeight: panelHeight };
        document.body.style.userSelect = 'none';
    };

    const handlePanelResizeMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!isPanelResizing || !panelResizeStartRef.current) return;
        if (e.cancelable) e.preventDefault(); // This prevents pull-to-refresh on mobile.
        const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const dy = panelResizeStartRef.current.y - currentY;
        const newHeight = panelResizeStartRef.current.initialHeight + dy;
        const minHeight = 40; // Allow panel to be very small, just the handle and actions
        const maxHeight = window.innerHeight - 80; // Leave enough space for modal header
        setPanelHeight(Math.max(minHeight, Math.min(newHeight, maxHeight)));
    }, [isPanelResizing]);

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

    const handleColumnResizeStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsColumnResizing(true);
        const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        columnResizeStartRef.current = { x: startX, initialWidth: panelWidth };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleColumnResizeMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!isColumnResizing || !columnResizeStartRef.current) return;
        const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const dx = currentX - columnResizeStartRef.current.x;
        const newWidth = columnResizeStartRef.current.initialWidth - dx;
        const minWidth = 100;
        const modalCurrentWidth = modalRef.current?.getBoundingClientRect().width || size.width;
        const maxWidth = modalCurrentWidth - 150;
        setPanelWidth(Math.max(minWidth, Math.min(newWidth, maxWidth)));
    }, [isColumnResizing, size.width]);

    const handleColumnResizeEnd = useCallback(() => {
        if (isColumnResizing) {
            setIsColumnResizing(false);
            columnResizeStartRef.current = null;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            localStorage.setItem(PANEL_WIDTH_KEY, panelWidth.toString());
        }
    }, [isColumnResizing, panelWidth]);

    useEffect(() => {
        if (isColumnResizing) {
            window.addEventListener('mousemove', handleColumnResizeMove);
            window.addEventListener('mouseup', handleColumnResizeEnd);
            window.addEventListener('touchmove', handleColumnResizeMove, { passive: false });
            window.addEventListener('touchend', handleColumnResizeEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleColumnResizeMove);
            window.removeEventListener('mouseup', handleColumnResizeEnd);
            window.removeEventListener('touchmove', handleColumnResizeMove);
            window.removeEventListener('touchend', handleColumnResizeEnd);
        };
    }, [isColumnResizing, handleColumnResizeMove, handleColumnResizeEnd]);


    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget && Date.now() - resizeEndTimestampRef.current > 100) handleClose(); };

    useEffect(() => {
        if (!article) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (isTheaterMode) {
                    setIsTheaterMode(false);
                } else {
                    handleClose();
                }
            }
            if (event.key === 'ArrowRight' && articleNavigation.hasNextArticle && !isTheaterMode) {
                articleNavigation.onNextArticle();
            }
            if (event.key === 'ArrowLeft' && articleNavigation.hasPreviousArticle && !isTheaterMode) {
                articleNavigation.onPreviousArticle();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [article, handleClose, articleNavigation, isTheaterMode]);
    
    const handleTouchStart = (e: React.TouchEvent) => {
        const isInsideVideo = videoPlayerContainerRef.current?.contains(e.target as Node) ?? false;
        touchEndRef.current = null;
        touchStartRef.current = { x: e.targetTouches[0].clientX, isInsideVideo: isInsideVideo };
    };
    
    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartRef.current && !touchStartRef.current.isInsideVideo) { touchEndRef.current = e.targetTouches[0].clientX; }
    };
    
    const handleTouchEnd = () => {
        if (!touchStartRef.current || !touchEndRef.current || touchStartRef.current.isInsideVideo) { touchStartRef.current = null; touchEndRef.current = null; return; }
        const distance = touchStartRef.current.x - touchEndRef.current;
        if (distance > minSwipeDistance && articleNavigation.hasNextArticle) { articleNavigation.onNextArticle(); }
        if (distance < -minSwipeDistance && articleNavigation.hasPreviousArticle) { articleNavigation.onPreviousArticle(); }
        touchStartRef.current = null; touchEndRef.current = null;
    };

    const generateSummaryFromAvailableContent = useCallback(async () => {
        if (!article) return;
    
        try {
            const currentTranscriptData = transcriptRef.current;
    
            if (currentTranscriptData && currentTranscriptData.transcript.length > 0) {
                if (currentTranscriptData.transcript.length < 3) throw new Error("The transcript is too short to summarize.");
                const newStructuredSummary = await summarizeYouTubeVideo(article.title, currentTranscriptData.transcript, aiModel);
                setStructuredSummary(newStructuredSummary);
                handleSummaryGenerated(article.id, newStructuredSummary);
            } else {
                const plainText = (article.content || article.description).replace(/<[^>]*>?/gm, '');
                if (plainText.trim().length < 50) throw new Error("The content from the feed is too short to summarize.");
                const newSummary = await summarizeText(plainText, aiModel);
                setSummary(newSummary);
                handleSummaryGenerated(article.id, newSummary);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "An unknown error occurred.");
        } finally {
            setIsSummarizing(false);
            summaryPendingRef.current = false;
        }
    }, [article, aiModel, handleSummaryGenerated]);

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
                    } else {
                        setTranscriptError("No transcripts available for this video.");
                    }
                } catch (e) {
                    setTranscriptError(e instanceof Error ? e.message : "Could not fetch transcript languages.");
                } finally {
                    setIsFetchingChoices(false);
                }
            };
            fetchChoices();
        }
    }, [videoId]);

    useEffect(() => {
        if (selectedCaptionUrl) {
            const fetchTranscript = async () => {
                setIsFetchingTranscript(true);
                setTranscriptError(null);
                setTranscriptData(null);
                try {
                    const transcript = await fetchAndParseTranscript(selectedCaptionUrl);
                    const choice = captionChoices?.find(c => c.url === selectedCaptionUrl);
                    setTranscriptData({ transcript, language: choice?.label });
                    lineRefs.current = [];
                } catch (e) {
                    setTranscriptError(e instanceof Error ? e.message : "Failed to load transcript.");
                    summaryPendingRef.current = false;
                    setIsSummarizing(false);
                } finally {
                    setIsFetchingTranscript(false);
                }
            };
            fetchTranscript();
        }
    }, [selectedCaptionUrl, captionChoices]);
    
    const handleSummarizeContent = useCallback(async () => {
        if (!article) return;
        window.speechSynthesis.cancel();
        setActiveTab('summary');
        setIsSummarizing(true);
        setError(null);
        setSummary(null);
        setStructuredSummary(null);
        summaryPendingRef.current = true;
    
        try {
            if (transcriptRef.current && transcriptRef.current.transcript.length > 0) {
                await generateSummaryFromAvailableContent();
            } else if (article.isVideo) {
                // If it's a video, transcript fetching is automatic. We just wait.
                // The `isSummarizing` state will show a loading indicator.
            } else {
                await generateSummaryFromAvailableContent();
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "An unknown error occurred.");
            setIsSummarizing(false);
            summaryPendingRef.current = false;
        }
    }, [article, generateSummaryFromAvailableContent]);

    useEffect(() => {
        if (summaryPendingRef.current && transcriptData && transcriptData.transcript.length > 0) {
            generateSummaryFromAvailableContent();
        }
    }, [transcriptData, generateSummaryFromAvailableContent]);

    useEffect(() => {
        if (!article) return;
        setSummary(article.summary || null); 
        setStructuredSummary(article.structuredSummary || null); 
        setError(null);
    }, [article]);
    
    const handleLikeClick = () => {
        if (!article || !article.isVideo) return;
        const videoId = getYouTubeId(article.link);
        if (!videoId || likedVideoIds.has(videoId)) return;
        handleLikeVideo(article);
    };
    
    const stopTranscriptSync = useCallback(() => {
        if (timeUpdateIntervalRef.current) {
            clearInterval(timeUpdateIntervalRef.current);
            timeUpdateIntervalRef.current = null;
        }
    }, []);

    const startTranscriptSync = useCallback(() => {
        stopTranscriptSync();
        const transcript = transcriptRef.current?.transcript;
        if (!playerRef.current || !transcript) return;
    
        timeUpdateIntervalRef.current = window.setInterval(() => {
            const localPlayer = playerRef.current;
            const localTranscript = transcriptRef.current?.transcript;
            if (!localPlayer || !localTranscript) return;
            
            const currentTime = localPlayer.getCurrentTime();
            if (typeof currentTime !== 'number') return;
            
            let newIndex = -1;
            for (let i = localTranscript.length - 1; i >= 0; i--) {
                if (localTranscript[i].start <= currentTime) {
                    newIndex = i;
                    break;
                }
            }
            setActiveTranscriptIndex(prevIndex => (newIndex !== -1 && newIndex !== prevIndex) ? newIndex : prevIndex);
        }, 250);
    }, [stopTranscriptSync]);

    useEffect(() => {
        if (isAutoscrollActive && activeTranscriptIndex !== null && lineRefs.current[activeTranscriptIndex]) {
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
    
    const onPlayerStateChange = useCallback((event: YT.PlayerStateChangeEvent) => {
        if (event.data === YT.PlayerState.PLAYING) startTranscriptSync();
        else stopTranscriptSync();

        if (event.data === YT.PlayerState.CUED && autoplayModeRef.current !== 'off') {
            event.target.playVideo();
        }

        if (event.data === YT.PlayerState.ENDED) {
            if (autoplayModeRef.current === 'repeat') {
                event.target.seekTo(0, true);
                event.target.playVideo();
            } else if (autoplayModeRef.current === 'on') {
                if (navigationRef.current.hasNextArticle) {
                    navigationRef.current.onNextArticle();
                }
            } else if (autoplayModeRef.current === 'random') {
                const videoArticles = articlesForNavigationRef.current.filter(a => a.isVideo);
                if (videoArticles.length <= 1) return;

                const currentArticleId = currentArticleRef.current?.id;
                const potentialNextArticles = videoArticles.filter(a => a.id !== currentArticleId);

                const nextArticle = potentialNextArticles.length > 0
                    ? potentialNextArticles[Math.floor(Math.random() * potentialNextArticles.length)]
                    : videoArticles[0]; // Fallback if only one video is left (or somehow current is not in the list)
                handleOpenArticleRef.current(nextArticle);
            }
        }
    }, [startTranscriptSync, stopTranscriptSync]);

    const onPlayerError = useCallback((event: { data: number; target: YT.Player }) => {
        console.error('YouTube Player Error:', event.data);
        let errorMessage = 'An unknown error occurred with the YouTube player.';
        switch (event.data) {
            case 2: errorMessage = 'The video ID is invalid.'; break;
            case 5: errorMessage = 'An error occurred in the HTML5 player.'; break;
            case 100: errorMessage = 'The video was not found or has been removed.'; break;
            case 101: case 150: errorMessage = 'The video owner does not allow it to be played in embedded players.'; break;
        }
        setError(errorMessage);
    }, []);

    const onPlayerStateChangeRef = useRef(onPlayerStateChange);
    useEffect(() => { onPlayerStateChangeRef.current = onPlayerStateChange; }, [onPlayerStateChange]);
    const onPlayerErrorRef = useRef(onPlayerError);
    useEffect(() => { onPlayerErrorRef.current = onPlayerError; }, [onPlayerError]);

    // This effect handles player destruction ONLY when the modal unmounts.
    useEffect(() => {
        return () => {
            if (playerRef.current) {
                // Safely destroy the player when the modal is truly gone.
                try {
                    playerRef.current.destroy();
                } catch (e) {
                    console.error("Error destroying YouTube player:", e);
                }
                playerRef.current = null;
            }
        };
    }, []); // Empty dependency array. Runs once on mount, cleanup on unmount.

    // This effect handles creation, updating, and stopping the video based on videoId.
    useEffect(() => {
        const playerElementId = 'youtube-player-container';
        
        const managePlayer = async () => {
            if (videoId) {
                // We have a video to play.
                await ensureYouTubeApiReady();
                
                if (playerRef.current) {
                    // Player exists, just load the new video if it's different.
                    const playerUrl = playerRef.current.getVideoUrl();
                    if (!playerUrl || !playerUrl.includes(videoId)) {
                        playerRef.current.loadVideoById(videoId);
                    }
                } else {
                    // Player doesn't exist, create it for the first time.
                    playerRef.current = new YT.Player(playerElementId, {
                        videoId,
                        playerVars: { controls: 1, rel: 0, showinfo: 0, iv_load_policy: 3, modestbranding: 1, origin: window.location.origin, autoplay: autoplayModeRef.current !== 'off' ? 1 : 0 },
                        events: {
                            onStateChange: (e) => onPlayerStateChangeRef.current(e),
                            onError: (e) => onPlayerErrorRef.current(e),
                        }
                    });
                }
            } else {
                // No video to play. Stop the video if a player exists.
                if (playerRef.current && typeof playerRef.current.stopVideo === 'function') {
                    playerRef.current.stopVideo();
                }
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
        if (!article?.content || !article.hasIframe) {
            return { playerHtml: '', descriptionHtml: '' };
        }
        try {
            const doc = new DOMParser().parseFromString(article.content, 'text/html');
            const iframe = doc.querySelector('iframe');
            const playerHtml = iframe ? iframe.outerHTML : '';
            
            iframe?.remove();
            
            let descriptionHtml = doc.body.innerHTML.trim();
            descriptionHtml = descriptionHtml.replace(/^(<br\s*\/?>\s*|<img[^>]*>\s*)+|(<br\s*\/?>\s*)+$/g, '').trim();
            descriptionHtml = descriptionHtml.replace(/^-/, '').trim();

            return { playerHtml, descriptionHtml };
        } catch (e) {
            console.error("Failed to parse iframe content in modal:", e);
            const iframeMatch = article.content.match(/<iframe[\s\S]*?<\/iframe>/s);
            const playerHtml = iframeMatch ? iframeMatch[0] : '';
            const descriptionHtml = article.content.replace(playerHtml, '').trim();
            return { playerHtml, descriptionHtml };
        }
    }, [article]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (downloadDropdownRef.current && !downloadDropdownRef.current.contains(event.target as Node)) {
                setIsDownloadDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    if (!article) return null;
    
    const isRead = readArticleIds.has(article.id); const isReadLater = readLaterArticleIds.has(article.id);
    const isLiked = videoId ? likedVideoIds.has(videoId) : false;

    // Auto-like opened YouTube videos if the setting is enabled.
    useEffect(() => {
        if (!article || !videoId || !autoLikeYouTubeVideos || isLiked) {
            return;
        }
    
        const timer = setTimeout(() => {
            console.log(`[DEBUG] Auto-liking video after ${autoLikeDelaySeconds}s: ${article.title}`);
            handleLikeVideo(article, { isAutoLike: true });
        }, autoLikeDelaySeconds * 1000);
    
        // Cleanup function to clear the timeout if the article changes or modal closes
        return () => clearTimeout(timer);
    
    }, [article, videoId, autoLikeYouTubeVideos, isLiked, handleLikeVideo, autoLikeDelaySeconds]);
    
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
            console.warn("Could not parse image URLs for comparison, falling back to string check.", e);
            return (article.content || article.description).includes(article.imageUrl);
        }
        return false;
    }, [article]);
    
    const shouldShowImage = article.imageUrl && !videoId && !article.hasIframe && !isImageInContent;

    const canSummarize = article && !!article.isVideo && hasTranscript;

    let summaryTooltipText: string;
    if (isSummarizing) {
        summaryTooltipText = 'Generating...';
    } else if (summary || structuredSummary) {
        summaryTooltipText = 'Regenerate Summary';
    } else if (canSummarize) {
        summaryTooltipText = 'Generate AI Summary';
    } else {
        summaryTooltipText = 'No transcript available to summarize';
    }
    
    const handleToggleAutoscroll = (shouldBeActive: boolean) => {
        setIsAutoscrollActive(shouldBeActive);
        if (shouldBeActive && activeTranscriptIndex !== null && lineRefs.current[activeTranscriptIndex]) {
            lineRefs.current[activeTranscriptIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const handleTimestampClick = (seconds: number) => {
        if (playerRef.current) { playerRef.current.seekTo(seconds, true); playerRef.current.playVideo(); }
    };
    
    const currentOption = dropdownOptions.find(opt => opt.id === activeTab);
    const showLoadingDetails = article.isVideo && !article.content;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={handleBackdropClick} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            <div ref={modalRef} style={!isMaximized && !isMobileLayout ? { width: `${size.width}px`, height: `${size.height}px`, transform: `translate(${position.x}px, ${position.y}px)` } : {}} className={`${isTheaterMode ? 'bg-black' : 'bg-gray-800'} shadow-2xl flex flex-col overflow-hidden ${isMaximized || isMobileLayout ? 'w-screen h-screen rounded-none' : 'absolute rounded-lg'}`} onClick={e => e.stopPropagation()}>
                {!isTheaterMode && (
                    <header onMouseDown={(e) => handleInteractionStart(e, 'drag')} onTouchStart={(e) => handleInteractionStart(e, 'drag')} className={`p-4 border-b border-gray-700 flex-shrink-0 flex flex-col md:flex-row md:items-start gap-2 md:gap-4 ${!isMaximized && !isMobileLayout ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                        <div className="flex-1 min-w-0 order-2 md:order-1">
                            <h2 className="text-lg md:text-xl font-bold text-white">{article.title}</h2>
                            {article.tags && article.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {article.tags.map(tag => (
                                        <span key={tag} className="px-2 py-0.5 text-xs font-medium bg-gray-700 text-gray-300 rounded-full">{tag}</span>
                                    ))}
                                </div>
                            )}
                            <div className="text-sm text-gray-400 mt-1 flex items-center flex-wrap gap-x-2 gap-y-1">
                                <button onClick={handleNavigateToFeed} className="hover:underline text-left" title={`Go to ${article.feedTitle} feed`}>
                                    {article.feedTitle}
                                </button>
                                <span className="hidden sm:inline">&bull;</span>
                                <span>{formatRelativeDate(article.pubDateTimestamp)}</span>
                                {article.views != null && <><span className="hidden sm:inline">&bull;</span><span className="flex items-center gap-1"><EyeIcon className="w-4 h-4" /> {formatViews(article.views)}</span></>}
                            </div>
                        </div>
                        <div className="w-full md:w-auto flex-shrink-0 flex items-center justify-between order-1 md:order-2">
                            <div className="md:hidden w-6 h-6"></div>
                            <div className="flex items-center gap-2">
                                <button onClick={articleNavigation.onPreviousArticle} disabled={!articleNavigation.hasPreviousArticle} title="Previous Article (Left Arrow)" className="p-1 rounded-full text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"><ChevronLeftIcon className="w-6 h-6" /></button>
                                <button onClick={articleNavigation.onNextArticle} disabled={!articleNavigation.hasNextArticle} title="Next Article (Right Arrow)" className="p-1 rounded-full text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"><ChevronRightIcon className="w-6 h-6" /></button>
                                {videoId && !isMobileLayout && <button onClick={() => setIsTheaterMode(true)} title="Theater Mode" className="text-gray-400 hover:text-white p-1"><MaximizeIcon className="w-5 h-5" /></button>}
                                {!isMobileLayout && <button onClick={toggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'} className="text-gray-400 hover:text-white p-1">{isMaximized ? <RestoreIcon className="w-5 h-5" /> : <MaximizeIcon className="w-5 h-5" />}</button>}
                                <button onClick={handleClose} title="Close (Esc)" className="text-gray-400 hover:text-white p-1"><XIcon className="w-6 h-6" /></button>
                            </div>
                        </div>
                    </header>
                )}

                <div className={`flex-grow flex min-h-0 ${isMobileLayout ? 'flex-col' : 'flex-row'}`}>
                    <div className="flex-grow flex flex-col min-h-0 min-w-0 relative">
                        <div className={`flex-grow overflow-y-auto ${isMobileLayout || isTheaterMode ? 'h-full' : ''}`}>
                            {isTheaterMode && (
                                <div className="absolute top-2 right-2 z-20 flex items-center gap-2 bg-black/50 p-2 rounded-lg">
                                    <button onClick={() => setIsTheaterMode(false)} title="Exit Theater Mode" className="text-white hover:text-indigo-400 p-1">
                                        <RestoreIcon className="w-6 h-6" />
                                    </button>
                                    <button onClick={handleClose} title="Close (Esc)" className="text-white hover:text-indigo-400 p-1">
                                        <XIcon className="w-6 h-6" />
                                    </button>
                                </div>
                            )}
                            {(videoId || article.hasIframe) ? (
                                <div ref={videoPlayerContainerRef} className={`bg-black w-full relative ${isTheaterMode ? 'h-full aspect-auto' : isMobileLayout ? 'aspect-video' : 'h-full'}`}>
                                    {videoId && <div id="youtube-player-container" className="w-full h-full"></div>}
                                    {article.hasIframe && !videoId && (
                                        <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: parsedIframeContent.playerHtml }} />
                                    )}
                                </div>
                            ) : (
                                <div className="article-content-area flex-grow overflow-y-auto px-6 pt-4 pb-12 h-full">
                                    {shouldShowImage && <img src={article.imageUrl!} alt={article.title} className="w-full max-w-2xl mx-auto h-auto object-cover rounded-lg mb-6 shadow-lg" />}
                                    {showLoadingDetails ? (
                                        <div className="flex flex-col items-center justify-center p-6 text-center text-gray-400 h-full">
                                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-3"></div>
                                            <p className="font-semibold">Loading full video details...</p>
                                        </div>
                                    ) : (
                                        <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-headings:text-gray-100 prose-a:text-indigo-400 prose-strong:text-gray-200" dangerouslySetInnerHTML={{ __html: article.content || article.description }} />
                                    )}
                                </div>
                            )}
                        </div>

                         <div className="flex-shrink-0 p-2 border-t border-gray-700 bg-gray-800/80 flex justify-center items-center gap-2 flex-wrap">
                            <Tooltip text={isRead ? 'Mark as Unread' : 'Mark as Read'}><button onClick={() => article && handleToggleReadStatus(article.id)} className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"><span className="sr-only">{isRead ? 'Unread' : 'Read'}</span>{isRead ? <CheckCircleIcon className="w-5 h-5 text-indigo-400" /> : <EyeIcon className="w-5 h-5 text-gray-400 hover:text-white" />}</button></Tooltip>
                            <Tooltip text={isReadLater ? 'Remove from Read Later' : 'Save for Read Later'}><button onClick={() => article && handleToggleReadLater(article.id)} className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"><span className="sr-only">{isReadLater ? 'Saved' : 'Save'}</span><BookmarkIcon className={`w-5 h-5 ${isReadLater ? 'fill-current text-indigo-400' : 'text-gray-400 hover:text-white'}`} /></button></Tooltip>
                            <Tooltip text="Tag this article"><button onClick={() => setArticleToEditTags(article)} className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"><TagIcon className="w-5 h-5 text-gray-400 hover:text-white" /></button></Tooltip>
                            <Tooltip text="Remove Article"><button onClick={() => article && handleRemoveArticle(article.id, article.feedId)} className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"><span className="sr-only">Remove Article</span><TrashIcon className="w-5 h-5 text-gray-400 hover:text-red-400" /></button></Tooltip>
                            {videoId && (
                                <>
                                    <Tooltip text={isLiked ? 'Liked' : 'Like on YouTube'}><button onClick={handleLikeClick} disabled={isLiked || !videoId} className="p-2.5 rounded-md transition-colors hover:bg-gray-700 flex-1 flex justify-center items-center disabled:cursor-not-allowed"><span className="sr-only">{isLiked ? 'Liked' : 'Like'}</span><LikeIcon className={`w-5 h-5 ${isLiked ? 'fill-current text-indigo-400' : 'text-gray-400 hover:text-white disabled:text-gray-600'}`} /></button></Tooltip>
                                    <div className="relative" ref={downloadDropdownRef}>
                                        <Tooltip text="Download"><button onClick={() => setIsDownloadDropdownOpen(prev => !prev)} className="p-2.5 rounded-md transition-colors hover:bg-gray-700 flex-1 flex justify-center items-center disabled:cursor-not-allowed"><span className="sr-only">Download</span><DownloadIcon className="w-5 h-5 text-gray-400 hover:text-white" /></button></Tooltip>
                                        {isDownloadDropdownOpen && (
                                            <div className="absolute bottom-full mb-2 w-max bg-gray-700 rounded-md shadow-lg z-20 p-1 border border-gray-600">
                                                {audioDownloadUrl && <a href={audioDownloadUrl} target="_blank" rel="noopener noreferrer" download className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-indigo-600 text-sm text-gray-200"><MusicIcon className="w-4 h-4" /><span>Audio (opus)</span></a>}
                                                {video1080pDownloadUrl && <a href={video1080pDownloadUrl} target="_blank" rel="noopener noreferrer" download className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-indigo-600 text-sm text-gray-200"><VideoIcon className="w-4 h-4" /><span>Video (1080p)</span></a>}
                                                {video360pDownloadUrl && <a href={video360pDownloadUrl} target="_blank" rel="noopener noreferrer" download className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-indigo-600 text-sm text-gray-200"><VideoIcon className="w-4 h-4" /><span>Audio+Video (360p)</span></a>}
                                            </div>
                                        )}
                                    </div>
                                    <Tooltip text="Autoplay next"><button onClick={handleToggleAutoplayNext} className="p-2.5 rounded-md transition-colors hover:bg-gray-700 flex-1 flex justify-center items-center"><span className="sr-only">Autoplay Next</span><SkipForwardIcon className={`w-5 h-5 ${autoplayMode === 'on' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`} /></button></Tooltip>
                                    <Tooltip text="Autoplay random"><button onClick={handleToggleAutoplayRandom} className="p-2.5 rounded-md transition-colors hover:bg-gray-700 flex-1 flex justify-center items-center"><span className="sr-only">Autoplay Random</span><ShuffleIcon className={`w-5 h-5 ${autoplayMode === 'random' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`} /></button></Tooltip>
                                    <Tooltip text="Repeat"><button onClick={handleToggleAutoplayRepeat} className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"><span className="sr-only">Repeat</span><RepeatIcon className={`w-5 h-5 ${autoplayMode === 'repeat' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'}`} /></button></Tooltip>
                                </>
                            )}
                            {article.link && <Tooltip text="Open Original"><a href={article.link} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center"><span className="sr-only">Open Original</span><ExternalLinkIcon className="w-5 h-5 text-gray-400 hover:text-white" /></a></Tooltip>}
                            <Tooltip text={summaryTooltipText}><button onClick={handleSummarizeContent} disabled={isSummarizing || !canSummarize} className="p-2.5 rounded-md transition-colors hover:bg-gray-700/50 flex-1 flex justify-center items-center disabled:cursor-not-allowed"><span className="sr-only">{isSummarizing ? 'Generating...' : (summary || structuredSummary ? 'Regenerate' : 'Generate Summary')}</span><SparklesIcon className={`w-5 h-5 ${isSummarizing ? 'animate-pulse text-indigo-400' : 'text-gray-400 hover:text-white disabled:text-gray-600'}`} /></button></Tooltip>
                        </div>

                        {isPanelMinimized && !isMobileLayout && !isTheaterMode && (
                            <div className="absolute top-0 right-0 h-full flex items-center z-10">
                                <Tooltip text="Show Panel">
                                    <button onClick={() => setIsPanelMinimized(false)} className="mr-1 p-1 rounded-full bg-gray-700/80 hover:bg-indigo-600 text-gray-300 hover:text-white transition-all shadow-lg" aria-label="Show Panel">
                                        <ChevronLeftIcon className="w-5 h-5" />
                                    </button>
                                </Tooltip>
                            </div>
                        )}
                    </div>
                    {(isMobileLayout || (!isTheaterMode && !isPanelMinimized)) && (
                        <>
                            {!isMobileLayout && (
                                <div
                                    onMouseDown={handleColumnResizeStart}
                                    onTouchStart={handleColumnResizeStart}
                                    onDoubleClick={togglePanelMinimized}
                                    className="relative flex-shrink-0 w-4 bg-gray-700/20 hover:bg-indigo-500/50 transition-colors duration-200 cursor-col-resize group"
                                >
                                    <Tooltip text="Hide Panel">
                                        <button
                                            onClick={() => setIsPanelMinimized(true)}
                                            className="absolute top-1/2 -translate-y-1/2 -left-2.5 z-10 p-1 rounded-full bg-gray-800 hover:bg-indigo-600 text-gray-300 hover:text-white transition-all opacity-0 group-hover:opacity-100 border border-gray-700 shadow-lg"
                                            aria-label="Hide Panel"
                                        >
                                            <ChevronRightIcon className="w-5 h-5" />
                                        </button>
                                    </Tooltip>
                                </div>
                            )}
                            <div
                                ref={rightPanelRef}
                                className={`flex-shrink-0 bg-gray-800/50 flex flex-col ${isMobileLayout ? 'border-t-2 border-gray-700' : 'min-h-0'}`}
                                style={isMobileLayout ? { height: isMobilePanelMinimized ? 'auto' : `${panelHeight}px` } : { width: `${panelWidth}px` }}
                            >
                                {isMobileLayout && (
                                    <div 
                                        onMouseDown={!isMobilePanelMinimized ? handlePanelResizeStart : undefined} 
                                        onTouchStart={!isMobilePanelMinimized ? handlePanelResizeStart : undefined} 
                                        onDoubleClick={toggleMobilePanel}
                                        className={`flex-shrink-0 h-8 bg-gray-700 hover:bg-indigo-500 transition-colors ${!isMobilePanelMinimized ? 'cursor-row-resize' : 'cursor-pointer'} w-full flex items-center justify-center`}
                                    >
                                        {isMobilePanelMinimized ? <ChevronUpIcon className="w-6 h-6 text-gray-400" /> : <ChevronDownIcon className="w-6 h-6 text-gray-400" />}
                                    </div>
                                )}

                                {(!isMobileLayout || !isMobilePanelMinimized) && (
                                    <>
                                        <div className="flex-shrink-0 p-3 border-b border-gray-700">
                                            <div className="relative" ref={dropdownRef}>
                                                <button
                                                    onClick={() => setIsDropdownOpen(prev => !prev)}
                                                    className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {currentOption && <currentOption.icon className="w-5 h-5 text-indigo-400" />}
                                                        <span className="font-semibold text-gray-200">{currentOption?.label}</span>
                                                    </div>
                                                    <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                                {isDropdownOpen && (
                                                    <div className="absolute top-full mt-1 w-full bg-gray-700 rounded-md shadow-lg z-20 p-1 border border-gray-600">
                                                        {dropdownOptions.map(option => (
                                                            <button
                                                                key={option.id}
                                                                onClick={() => { setActiveTab(option.id); setIsDropdownOpen(false); }}
                                                                className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-indigo-600 text-sm text-gray-200"
                                                            >
                                                                <option.icon className="w-5 h-5" />
                                                                <span>{option.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-grow overflow-y-auto p-4 article-content-area" onScroll={handleManualScroll} ref={transcriptContainerRef}>
                                            {activeTab === 'summary' && (
                                                isSummarizing ? (
                                                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                                                        <p className="font-semibold">Generating AI Summary...</p>
                                                        <p className="text-xs">This might take up to a minute.</p>
                                                    </div>
                                                ) : error ? (
                                                    <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm">
                                                        <p className="font-semibold mb-1">Error generating summary:</p>
                                                        <p>{error}</p>
                                                    </div>
                                                ) : structuredSummary ? (
                                                    <div>
                                                        <div className="prose prose-invert max-w-none prose-p:my-2 prose-sm">
                                                            <p>{structuredSummary.overallSummary}</p>
                                                        </div>
                                                        <div className="mt-4 space-y-3">
                                                            {structuredSummary.sections.map((section, index) => (
                                                                <div key={index} className="bg-gray-900/50 p-2 rounded-md cursor-pointer hover:bg-gray-900" onClick={() => handleTimestampClick(section.timestamp)}>
                                                                    <p className="font-semibold text-indigo-400 text-sm">{formatTranscriptTime(section.timestamp)} - {section.title}</p>
                                                                    <p className="text-xs text-gray-400 mt-1">{section.summary}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : summary ? (
                                                    <div className="prose prose-invert max-w-none prose-p:my-2 prose-sm">
                                                        <p>{summary}</p>
                                                    </div>
                                                ) : (
                                                    <div className="text-center text-gray-500 text-sm py-10">
                                                        No summary available. Click the <SparklesIcon className="w-4 h-4 inline-block mx-1" /> icon to generate one.
                                                    </div>
                                                )
                                            )}
                                            {activeTab === 'transcript' && (
                                                isFetchingTranscript || isFetchingChoices ? (
                                                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                                                        <p className="font-semibold">{isFetchingChoices ? 'Finding transcripts...' : 'Loading transcript...'}</p>
                                                    </div>
                                                ) : transcriptError ? (
                                                    <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm">
                                                        <p className="font-semibold mb-1">Error loading transcript:</p>
                                                        <p>{transcriptError}</p>
                                                    </div>
                                                ) : transcriptData && transcriptData.transcript.length > 0 ? (
                                                    <div>
                                                        <div className="flex justify-between items-center mb-2 sticky top-0 bg-gray-800 py-2 z-10">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                {captionChoices && captionChoices.length > 1 && (
                                                                    <select
                                                                        value={selectedCaptionUrl || ''}
                                                                        onChange={(e) => setSelectedCaptionUrl(e.target.value)}
                                                                        className="bg-gray-700 text-white text-xs font-semibold py-1 pl-2 pr-6 rounded-md appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                    >
                                                                        {captionChoices.map(c => <option key={c.url} value={c.url}>{c.label}</option>)}
                                                                    </select>
                                                                )}
                                                            </div>
                                                            <label htmlFor="autoscroll-toggle" className="flex items-center text-xs text-gray-400 cursor-pointer">
                                                                <input
                                                                    id="autoscroll-toggle"
                                                                    type="checkbox"
                                                                    checked={isAutoscrollActive}
                                                                    onChange={(e) => handleToggleAutoscroll(e.target.checked)}
                                                                    className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"
                                                                />
                                                                <span className="ml-2">Autoscroll</span>
                                                            </label>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {transcriptData.transcript.map((line, index) => (
                                                                <div
                                                                    key={index}
                                                                    // FIX: The ref callback should not return a value. Wrap in braces to ensure an implicit undefined return.
                                                                    ref={el => { lineRefs.current[index] = el; }}
                                                                    onClick={() => handleTimestampClick(line.start)}
                                                                    className={`p-2 rounded-md cursor-pointer transition-colors text-sm ${activeTranscriptIndex === index ? 'bg-indigo-500/20' : 'hover:bg-gray-700/50'}`}
                                                                    dir={isRtl(transcriptData.language) ? 'rtl' : 'ltr'}
                                                                >
                                                                    <span className="font-mono text-xs text-indigo-400 mr-2">{formatTranscriptTime(line.start)}</span>
                                                                    <span className={activeTranscriptIndex === index ? 'text-white' : 'text-gray-300'}>{line.text}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : null
                                            )}
                                            {activeTab === 'comments' && (
                                                commentsState.isLoading ? (
                                                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                                                        <p className="font-semibold">Loading Comments...</p>
                                                    </div>
                                                ) : commentsState.error ? (
                                                    <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm">
                                                        <p className="font-semibold mb-1">Error loading comments:</p>
                                                        <p>{commentsState.error}</p>
                                                    </div>
                                                ) : commentsState.comments && commentsState.comments.length > 0 ? (
                                                    <div className="divide-y divide-gray-700/50">
                                                        {commentsState.comments.map(comment => <CommentItem key={comment.commentId} comment={comment} />)}
                                                    </div>
                                                ) : (
                                                    <div className="text-center text-gray-500 text-sm py-10">No comments found or comments are disabled.</div>
                                                )
                                            )}
                                            {activeTab === 'details' && (
                                                showLoadingDetails ? (
                                                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                                                        <p className="font-semibold">Loading full video details...</p>
                                                    </div>
                                                ) : (
                                                    <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-headings:text-gray-100 prose-a:text-indigo-400 prose-strong:text-gray-200"
                                                        dangerouslySetInnerHTML={{ __html: article.hasIframe ? parsedIframeContent.descriptionHtml : (article.content || article.description) }}
                                                    />
                                                )
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
                {!isMaximized && !isMobileLayout && (
                    <>
                        <div onMouseDown={(e) => handleInteractionStart(e, 'resize', 'nw')} onTouchStart={(e) => handleInteractionStart(e, 'resize', 'nw')} className="absolute -top-1 -left-1 w-4 h-4 cursor-nw-resize z-10" />
                        <div onMouseDown={(e) => handleInteractionStart(e, 'resize', 'n')} onTouchStart={(e) => handleInteractionStart(e, 'resize', 'n')} className="absolute -top-1 left-1/2 -translate-x-1/2 w-full h-2 cursor-n-resize z-10" />
                        <div onMouseDown={(e) => handleInteractionStart(e, 'resize', 'ne')} onTouchStart={(e) => handleInteractionStart(e, 'resize', 'ne')} className="absolute -top-1 -right-1 w-4 h-4 cursor-ne-resize z-10" />
                        <div onMouseDown={(e) => handleInteractionStart(e, 'resize', 'e')} onTouchStart={(e) => handleInteractionStart(e, 'resize', 'e')} className="absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-full cursor-e-resize z-10" />
                        <div onMouseDown={(e) => handleInteractionStart(e, 'resize', 'se')} onTouchStart={(e) => handleInteractionStart(e, 'resize', 'se')} className="absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize z-10" />
                        <div onMouseDown={(e) => handleInteractionStart(e, 'resize', 's')} onTouchStart={(e) => handleInteractionStart(e, 'resize', 's')} className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-full h-2 cursor-s-resize z-10" />
                        <div onMouseDown={(e) => handleInteractionStart(e, 'resize', 'sw')} onTouchStart={(e) => handleInteractionStart(e, 'resize', 'sw')} className="absolute -bottom-1 -left-1 w-4 h-4 cursor-sw-resize z-10" />
                        <div onMouseDown={(e) => handleInteractionStart(e, 'resize', 'w')} onTouchStart={(e) => handleInteractionStart(e, 'resize', 'w')} className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-full cursor-w-resize z-10" />
                    </>
                )}
            </div>
        </div>
    );
};