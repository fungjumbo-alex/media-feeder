import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { SparklesIcon, TagIcon, ImportIcon, ExportIcon, RssIcon, BookmarkIcon } from './icons';

const Feature: React.FC<{ icon: React.ReactNode; title: string; description: string; }> = ({ icon, title, description }) => (
    <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1 text-indigo-400">{icon}</div>
        <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-gray-400 mt-1">{description}</p>
        </div>
    </div>
);

export const AboutContent: React.FC = () => {
    const { handleViewChange } = useAppContext();

    return (
        <div className="flex-1 overflow-y-auto bg-gray-900 p-6 sm:p-8">
            <div className="max-w-3xl mx-auto bg-gray-800 p-6 sm:p-8 rounded-lg shadow-lg">
                <h1 className="text-3xl font-bold text-white mb-4">About Media-Feeder</h1>
                <p className="text-gray-400 mb-6">
                    A modern, privacy-focused YouTube & RSS feed reader that uses AI to help you discover, summarize, and organize content without leaving your browser.
                </p>

                <div className="space-y-8">
                    <Feature
                        icon={<RssIcon className="w-6 h-6" />}
                        title="Unified Feed"
                        description="Subscribe to any YouTube channel, playlist, or RSS feed. All your content is aggregated into a single, clean interface."
                    />
                    <Feature
                        icon={<SparklesIcon className="w-6 h-6" />}
                        title="AI-Powered Summaries & Digests"
                        description="Save time with AI. Generate concise summaries for individual videos or articles. You can also create a digest from multiple selected items to get a high-level overview of a topic."
                    />
                    <Feature
                        icon={<TagIcon className="w-6 h-6" />}
                        title="Advanced Organization"
                        description="Use custom tags to categorize your feeds and articles. Filter your views by tags to create personalized content streams."
                    />
                    <Feature
                        icon={<ImportIcon className="w-6 h-6" />}
                        title="Easy Import"
                        description="Quickly import your existing subscriptions from YouTube by connecting your Google Account, or import from a list of channels."
                    />
                     <Feature
                        icon={<BookmarkIcon className="w-6 h-6" />}
                        title="Read Later & History"
                        description="Save interesting articles to read later. The app also keeps a history of articles you've opened for easy reference."
                    />
                    <Feature
                        icon={<ExportIcon className="w-6 h-6" />}
                        title="Privacy First & Data Portability"
                        description="All your data is stored locally in your browser—we have no servers and collect no personal information. Easily export your entire setup to a file or a shareable link to sync across devices."
                    />
                </div>

                <div className="mt-10 pt-6 border-t border-gray-700 text-center">
                    <h2 className="text-xl font-semibold text-white mb-2">Contact</h2>
                    <p className="text-gray-400">
                        Have questions, feedback, or feature requests?
                    </p>
                    <a href="mailto:fungjumbo@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                        fungjumbo@gmail.com
                    </a>
                </div>

                <div className="mt-8 text-center">
                    <button
                        onClick={() => handleViewChange('all-subscriptions')}
                        className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors"
                    >
                        Back to App
                    </button>
                </div>
            </div>
        </div>
    );
};