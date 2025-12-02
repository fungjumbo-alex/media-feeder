// The project uses a `process.env` polyfill defined in vite.config.ts, not vite's `import.meta.env`.

// Global constant defined by vite.config.ts for obfuscated environment variables.
declare const __COMPRESSED_ENV__: Record<string, string>;

declare module 'lz-string';

declare namespace google {
    namespace accounts {
        namespace oauth2 {
            function initTokenClient(config: TokenClientConfig): TokenClient;
            function revoke(token: string, done: () => void): void;
            function hasGrantedAllScopes(token: TokenResponse, firstScope: string, ...restScopes: string[]): boolean;
            function hasGrantedAnyScope(token: TokenResponse, firstScope: string, ...restScopes: string[]): boolean;

            interface TokenClient {
                requestAccessToken(overrideConfig?: { prompt?: string; scope?: string; }): void;
            }

            interface TokenClientConfig {
                client_id: string;
                scope: string;
                callback: (tokenResponse: TokenResponse) => void;
                error_callback?: (error: any) => void;
            }

            interface TokenResponse {
                access_token: string;
                expires_in: number;
                scope: string;
                token_type: string;
                error?: string;
                error_description?: string;
                error_uri?: string;
            }
        }
    }
}

// YouTube IFrame Player API
declare namespace YT {
    enum PlayerState {
        UNSTARTED = -1,
        ENDED = 0,
        PLAYING = 1,
        PAUSED = 2,
        BUFFERING = 3,
        CUED = 5,
    }

    interface PlayerOptions {
        height?: string;
        width?: string;
        videoId?: string;
        playerVars?: PlayerVars;
        events?: Events;
    }

    interface PlayerVars {
        autoplay?: 0 | 1;
        controls?: 0 | 1;
        rel?: 0 | 1;
        showinfo?: 0 | 1;
        iv_load_policy?: 1 | 3;
        modestbranding?: 1;
        [key: string]: any;
    }

    interface PlayerEvent {
        target: Player;
    }

    interface Events {
        onReady?: (event: PlayerEvent) => void;
        onStateChange?: (event: PlayerStateChangeEvent) => void;
        onError?: (event: { data: number, target: Player }) => void;
        onApiChange?: (event: PlayerEvent) => void;
    }
    
    interface PlayerStateChangeEvent {
        data: PlayerState;
        target: Player;
    }

    class Player {
        constructor(elementId: string | HTMLElement, options: PlayerOptions);
        destroy(): void;
        playVideo(): void;
        pauseVideo(): void;
        stopVideo(): void;
        loadVideoById(options: string | { videoId: string, startSeconds?: number, endSeconds?: number }): void;
        cueVideoById(options: string | { videoId: string, startSeconds?: number, endSeconds?: number }): void;
        seekTo(seconds: number, allowSeekAhead: boolean): void;
        getVolume(): number;
        setVolume(volume: number): void;
        isMuted(): boolean;
        mute(): void;
        unMute(): void;
        getPlaybackRate(): number;
        setPlaybackRate(rate: number): void;
        getAvailablePlaybackRates(): number[];
        getPlayerState(): PlayerState;
        getCurrentTime(): number;
        getDuration(): number;
        getVideoUrl(): string;
        getIframe(): HTMLIFrameElement;
        // Caption-related methods
        getOptions(option: string): any; // Can return object or array
        setOption(module: string, option: string, value: any): void;
        loadModule(module: string): void;
        unloadModule(module: string): void;
    }
}

interface Window {
  onYouTubeIframeAPIReady?: () => void;
  YT?: typeof YT;
}
