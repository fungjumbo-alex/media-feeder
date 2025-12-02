import React from 'react';
import { useAppContext } from '../contexts/AppContext';

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
    <section id={id} className="mb-8 scroll-mt-24">
        <h2 className="text-2xl font-bold text-indigo-400 mb-4 pb-2 border-b-2 border-gray-700">{title}</h2>
        <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-headings:text-gray-200 prose-a:text-indigo-400 prose-strong:text-white">
            {children}
        </div>
    </section>
);

export const HelpContent: React.FC = () => {
    const { handleViewChange } = useAppContext();

    const sections = [
        { id: 'quick-start', title: 'Quick Start Guide' },
        { id: 'content', title: 'Content & Feeds' },
        { id: 'ai-features', title: 'AI Features' },
        { id: 'organization', title: 'Organization' },
        { id: 'viewer', title: 'Article & Video Viewer' },
        { id: 'mobile-offline', title: 'Mobile & Offline Use' },
        { id: 'data-sync', title: 'Data, Syncing & Sharing' },
        { id: 'browser-extension', title: 'Browser Extension' },
        { id: 'youtube-account', title: 'YouTube Account Features' },
    ];
    
    const handleQuickLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        const href = e.currentTarget.getAttribute('href');
        if (href) {
            const id = href.substring(1); // remove '#'
            const element = document.getElementById(id);
            if (element) {
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                // Update hash manually for accessibility and history, without triggering router
                if(history.pushState) {
                    history.pushState(null, '', href);
                } else {
                    location.hash = href;
                }
            }
        }
    };


    return (
        <div className="flex-1 overflow-y-auto bg-gray-900 p-6 sm:p-8">
            <div className="max-w-4xl mx-auto flex gap-8">
                <main className="flex-1">
                    <div className="bg-gray-800 p-6 sm:p-8 rounded-lg shadow-lg">
                        <h1 className="text-3xl font-bold text-white mb-6">Help & Guide</h1>

                        <Section id="quick-start" title="Quick Start Guide">
                            <p>Welcome to Media-Feeder! Here’s how to get started in 5 simple steps:</p>
                            <ol>
                                <li><strong>Add Your First Feed:</strong> Go to <strong>Actions & Settings &gt; Follow New Source</strong>. Paste a YouTube channel URL (e.g., <code>https://www.youtube.com/@mkbhd</code>) or any RSS feed URL.</li>
                                <li><strong>Import from YouTube:</strong> To add all your subscriptions at once, go to <strong>Actions & Settings &gt; Import from YouTube</strong>. You'll be asked to sign in to your Google Account.</li>
                                <li><strong>Browse Your Content:</strong> Your feeds will appear in the main grid. Click any feed to see its latest articles or videos.</li>
                                <li><strong>Use AI Summaries:</strong> Open any video or article. In the side panel, click the ✨ icon to get a concise AI summary.</li>
                                <li><strong>Sync to Another Device:</strong> Go to <strong>Actions & Settings &gt; Sync Data</strong>. Under "Live Sync", click <strong>"Create Reusable Code"</strong>. On another device, use "Import Data" and enter this same code to pull your latest data.</li>
                            </ol>
                        </Section>

                        <Section id="content" title="Content & Feeds">
                            <p>You can add almost any content source with a URL.</p>
                            <ul>
                                <li><strong>YouTube:</strong> Add channels, playlists, or even single videos.</li>
                                <li><strong>RSS Feeds:</strong> Add any standard RSS feed from blogs, news sites, etc.</li>
                                <li><strong>Reddit:</strong> Add the URL of any subreddit (e.g., <code>https://www.reddit.com/r/gadgets/</code>).</li>
                                <li><strong>Bilibili:</strong> Add user pages or category pages from Bilibili.</li>
                            </ul>
                            <p><strong>Refreshing:</strong> You can refresh a single feed from the header when viewing it, or refresh all/favorite feeds from the "Actions & Settings" menu.</p>
                        </Section>

                        <Section id="ai-features" title="AI Features">
                            <p>Media-Feeder uses AI to save you time and help you discover new content.</p>
                            <ul>
                                <li><strong>Summaries:</strong> Get summaries for individual articles or structured, timestamped summaries for YouTube videos with transcripts.</li>
                                <li><strong>Digests:</strong> In any article view, select multiple videos using the checkboxes, then click the ✨ icon in the header to create a combined "digest" summarizing all of them.</li>
                                <li><strong>Recommendations:</strong> From the "Actions & Settings" menu, choose "AI Recommendations" to discover new channels and blogs based on your subscriptions and history.</li>
                                <li><strong>Related Feeds:</strong> When viewing a feed, click the "Find Related Feeds" icon in the header to get AI suggestions for similar content.</li>
                            </ul>
                        </Section>

                        <Section id="organization" title="Organization">
                            <ul>
                                <li><strong>Tags:</strong> Assign tags to your feeds to categorize them. You can then browse all content from a specific tag. Feeds and articles can have multiple tags.</li>
                                <li><strong>Favorites:</strong> Mark your most important feeds as favorites for quick access.</li>
                                <li><strong>Read Later & History:</strong> Save articles for later or revisit items you've already opened in your History.</li>
                                <li><strong>Grid & List Views:</strong> Toggle between a thumbnail grid and a compact list view for articles using the icon in the header.</li>
                            </ul>
                        </Section>
                        
                        <Section id="viewer" title="Article & Video Viewer">
                            <p>The media viewer is designed for efficient content consumption.</p>
                            <ul>
                                <li><strong>Navigation:</strong> Use the <strong>Previous (←)</strong> and <strong>Next (→)</strong> arrows at the bottom of the viewer to quickly move through the articles in your current list. You can also use the left and right arrow keys on your keyboard.</li>
                                <li><strong>Autoplay:</strong> For videos, you can control what happens when a video ends. The controls are at the bottom of the viewer:
                                    <ul>
                                        <li><strong>Autoplay Next:</strong> Automatically plays the next video in the current list.</li>
                                        <li><strong>Autoplay Random:</strong> Plays a random video from the current list.</li>
                                        <li><strong>Repeat Video:</strong> Loops the current video.</li>
                                    </ul>
                                </li>
                            </ul>
                        </Section>
                        
                        <Section id="mobile-offline" title="Mobile & Offline Use">
                             <ul>
                                <li><strong>Add to Home Screen:</strong> For an app-like experience, you can add Media-Feeder to your home screen. On iOS, use the 'Share' button in Safari and select 'Add to Home Screen'. On Android, use the menu in Chrome and select 'Install app' or 'Add to Home screen'.</li>
                                <li><strong>Offline Reading:</strong> The app caches recently loaded articles from RSS and Reddit feeds. If you've opened a feed recently, its latest articles will be available to read even without an internet connection. YouTube video details, summaries, and streaming require an active connection.</li>
                            </ul>
                        </Section>

                        <Section id="data-sync" title="Data, Syncing & Sharing">
                            <p><strong>Your data is 100% private and stored locally in your browser.</strong> We have no servers and collect no data.</p>
                            <ul>
                                <li><strong>Live Sync (Recommended):</strong> The easiest way to keep multiple devices in sync. Create a **permanent, reusable code** that never changes. On your main device, click "Update Now" to push your latest data. On your other devices, simply import that same code to pull the latest version.</li>
                                <li><strong>One-Time Share Link:</strong> Generate a temporary code (expires in 24 hours) to share a snapshot of your feeds with a friend.</li>
                                <li><strong>Export to File:</strong> Create a full backup of your app data (feeds, articles, settings) as a <code>.json</code> file for manual backup.</li>
                                <li><strong>Importing:</strong> Use "Import Data" to load a backup file, or paste any share code (one-time or reusable) into the "Follow New Source" dialog.</li>
                            </ul>
                        </Section>
                        
                        <Section id="browser-extension" title="Companion Browser Extension">
                            <p>
                                This Chrome extension is the official browser companion for the Media-Feeder (AI News Reader) web application, designed to seamlessly integrate your feed management directly into your browsing experience. {' '}
                                <a href="https://chromewebstore.google.com/detail/add-to-ai-news-reader/mndmgjhcpmeoaideiakfkgmdafambabe" target="_blank" rel="noopener noreferrer">
                                    Get it from the Chrome Web Store.
                                </a>
                            </p>
                            <p>
                                Its primary purpose is to make discovering and adding new content effortless. When you find a website or blog you want to follow, simply click the extension's icon and use the "Send to AI News Reader" button. This action instantly opens your app and queues the new site to be added as a feed, saving you the hassle of copying and pasting URLs.
                            </p>
                            <p>
                                Beyond just adding new feeds, the extension also serves as a convenient mini-dashboard for your existing content. The popup provides a quick, at-a-glance overview of your personalized Views and Tags, complete with unread counts for each category and individual channel. You can expand these sections to see the specific feeds within them and click on any item to jump directly to it in the main web application.
                            </p>
                            <p>
                                With a simple refresh button to sync the latest data, this extension is the perfect tool for users of Media-Feeder who want to streamline their content discovery and stay updated on their feeds without leaving their current browsing session.
                            </p>
                        </Section>

                        <Section id="youtube-account" title="YouTube Account Features">
                            <p>By signing in with your Google Account (in <strong>Settings</strong>), you can unlock extra features:</p>
                            <ul>
                                <li><strong>Import from YouTube:</strong> The primary reason to connect your account. It allows the app to fetch your subscription list.</li>
                                <li><strong>Like Videos:</strong> You can like videos directly from within the app. You can also enable "Auto-like" in the settings.</li>
                                <li><strong>Playlist Access:</strong> Allows the app to fetch your private and "Watch Later" playlists if you add their URLs.</li>
                            </ul>
                            <p>The app only requests the minimum necessary permissions. You can review and revoke access at any time in your Google Account settings.</p>
                        </Section>

                        <div className="mt-8 text-center">
                            <button
                                onClick={() => handleViewChange('all-subscriptions')}
                                className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors"
                            >
                                Back to App
                            </button>
                        </div>
                    </div>
                </main>
                <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-8 self-start">
                    <nav className="bg-gray-800 p-4 rounded-lg">
                        <h3 className="font-semibold text-white mb-2">On this page</h3>
                        <ul className="space-y-2">
                            {sections.map(section => (
                                <li key={section.id}>
                                    <a href={`#${section.id}`} onClick={handleQuickLinkClick} className="text-gray-400 hover:text-indigo-300 text-sm">{section.title}</a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </aside>
            </div>
        </div>
    );
};
