
import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { YouTubeIcon, SparklesIcon, TagIcon, ImportIcon, ExportIcon } from './icons';

export const Homepage: React.FC = () => {
    const { handleEnterApp } = useAppContext();

    const handlePrivacyLinkClick = () => {
        // We need to launch the app so the main router can handle the hash change
        handleEnterApp();
        // The default anchor behavior will handle the navigation to the privacy policy hash
    };

    return (
        <div className="bg-gray-900 text-gray-200 min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
            <main className="max-w-4xl w-full text-center">
                <header className="mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold text-white mb-2">Media-Feeder</h1>
                    <p className="text-lg text-gray-400">
                        A modern YouTube & RSS feed reader that uses AI to summarize, recommend, and explore content.
                    </p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 text-left">
                    <FeatureCard
                        icon={<YouTubeIcon className="w-6 h-6 text-red-500" />}
                        title="Follow YouTube & RSS"
                        description="Subscribe to any YouTube channel, playlist, or RSS feed to bring all your content into one place."
                    />
                    <FeatureCard
                        icon={<SparklesIcon className="w-6 h-6 text-indigo-400" />}
                        title="AI-Powered Summaries"
                        description="Get concise AI-generated digests of videos and articles, saving you time and keeping you informed."
                    />
                    <FeatureCard
                        icon={<TagIcon className="w-6 h-6 text-sky-400" />}
                        title="Organize with Tags"
                        description="Categorize your feeds with custom tags to create personalized views and stay organized."
                    />
                    <FeatureCard
                        icon={<ImportIcon className="w-6 h-6 text-green-400" />}
                        title="Import Subscriptions"
                        description="Connect your Google account to quickly import your existing YouTube subscriptions."
                    />
                    <FeatureCard
                        icon={<ExportIcon className="w-6 h-6 text-yellow-400" />}
                        title="Export & Sync"
                        description="Backup your data to a file or generate a share link to sync your setup across devices."
                    />
                    <FeatureCard
                        icon={<SparklesIcon className="w-6 h-6 text-purple-400" />}
                        title="Content Discovery"
                        description="Let AI analyze your subscriptions and reading history to recommend new, relevant content."
                    />
                </div>
                
                <div className="mb-8">
                    <button
                        onClick={handleEnterApp}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-full text-lg transition-transform transform hover:scale-105"
                    >
                        Launch App
                    </button>
                </div>

                <footer className="text-sm text-gray-500">
                    <p className="mb-2">
                        By using Media-Feeder, you agree to its terms. The app requests permissions for your Google account to enable features like importing YouTube subscriptions and liking videos. 
                        All your data is stored locally in your browser.
                    </p>
                    <a href="#/privacy-policy" onClick={handlePrivacyLinkClick} className="underline hover:text-gray-300">
                        Read our full Privacy Policy
                    </a>
                </footer>
            </main>
        </div>
    );
};

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
        <div className="flex items-center mb-3">
            {icon}
            <h3 className="ml-3 text-lg font-semibold text-white">{title}</h3>
        </div>
        <p className="text-gray-400 text-sm">{description}</p>
    </div>
);