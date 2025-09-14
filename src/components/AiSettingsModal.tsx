import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, SettingsIcon, RefreshIcon, ZapOffIcon, BarChartIcon, GoogleIcon } from './icons';

export const AiSettingsModal: React.FC = () => {
    const {
        isAiSettingsModalOpen,
        setIsAiSettingsModalOpen,
        enableRssAndReddit,
        handleToggleRssAndReddit,
        autoLikeYouTubeVideos,
        handleToggleAutoLikeYouTubeVideos,
        autoLikeDelaySeconds,
        setAutoLikeDelaySeconds,
        handleRefreshMissingIcons,
        handleViewChange,
        isRefreshingAll,
        setIsAdvancedInfoModalOpen,
        userProfile,
        handleGoogleSignIn,
        handleGoogleSignOut,
    } = useAppContext();

    if (!isAiSettingsModalOpen) return null;

    const onClose = () => setIsAiSettingsModalOpen(false);

    const handleManageInactiveClick = () => {
        handleViewChange('inactive-feeds');
        onClose();
    };
    
    const handleStatsAndStorageClick = () => {
        setIsAdvancedInfoModalOpen(true);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg m-4 relative max-h-[90vh] flex flex-col">
                <header className="flex-shrink-0">
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                        <XIcon className="w-6 h-6" />
                    </button>
                    <div className="flex items-center mb-4">
                        <SettingsIcon className="w-8 h-8 mr-3 text-indigo-400" />
                        <h2 className="text-xl font-bold text-white">App Settings</h2>
                    </div>
                    <p className="text-gray-400 mb-6">
                        Configure general application features and behaviors.
                    </p>
                </header>
                <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">Account</h3>
                        <div className="bg-gray-700/50 p-4 rounded-lg">
                            {userProfile ? (
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-gray-100 truncate" title={userProfile.email}>
                                        {userProfile.email}
                                    </p>
                                    <button
                                        onClick={() => {
                                            handleGoogleSignOut();
                                            onClose();
                                        }}
                                        className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-500"
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            ) : (
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h4 className="font-semibold text-gray-100">Sign in with Google</h4>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Connect your account to like videos and import subscriptions.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            handleGoogleSignIn({ showConsentPrompt: true });
                                            onClose();
                                        }}
                                        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-white text-gray-800 hover:bg-gray-200 transition-colors"
                                    >
                                        <GoogleIcon className="w-5 h-5" />
                                        Sign In
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">Automation</h3>
                        <div className="bg-gray-700/50 p-4 rounded-lg space-y-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="font-semibold text-gray-100">Auto-like Opened YouTube Videos</h4>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Automatically "like" any YouTube video you open. Requires being signed in to Google.
                                    </p>
                                </div>
                                <label htmlFor="auto-like-toggle" className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        id="auto-like-toggle"
                                        className="sr-only peer"
                                        checked={autoLikeYouTubeVideos}
                                        onChange={handleToggleAutoLikeYouTubeVideos}
                                    />
                                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>
                             {autoLikeYouTubeVideos && (
                                <div className="border-t border-gray-600/50 pt-4">
                                    <label htmlFor="auto-like-delay" className="block text-sm font-medium text-gray-300 mb-1">
                                        Auto-like Delay (seconds)
                                    </label>
                                    <input
                                        type="number"
                                        id="auto-like-delay"
                                        value={autoLikeDelaySeconds}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            if (!isNaN(val) && val >= 0) setAutoLikeDelaySeconds(val);
                                        }}
                                        className="w-24 bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                                        min="0"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Delay before liking a video after it's opened. Default is 10.</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">Feed Settings</h3>
                        <div className="bg-gray-700/50 p-4 rounded-lg flex justify-between items-center">
                            <div>
                                <h4 className="font-semibold text-gray-100">Enable RSS & Reddit Feeds</h4>
                                <p className="text-xs text-gray-400 mt-1">
                                    Allow adding and viewing feeds from general RSS sources and Reddit.
                                </p>
                            </div>
                            <label htmlFor="enable-rss-reddit-toggle" className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    id="enable-rss-reddit-toggle"
                                    className="sr-only peer"
                                    checked={enableRssAndReddit}
                                    onChange={handleToggleRssAndReddit}
                                />
                                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>
                    </div>
                     <div>
                        <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">Maintenance</h3>
                        <div className="bg-gray-700/50 p-4 rounded-lg space-y-3">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="font-semibold text-gray-100">Stats & Storage</h4>
                                    <p className="text-xs text-gray-400 mt-1">
                                        View network/proxy statistics and manage local storage.
                                    </p>
                                </div>
                                <button onClick={handleStatsAndStorageClick} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500">
                                    <BarChartIcon className="w-4 h-4" />
                                    Manage
                                </button>
                            </div>
                            <div className="border-t border-gray-600/50"></div>
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="font-semibold text-gray-100">Refresh Missing Icons</h4>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Attempt to re-download missing icons for YouTube feeds.
                                    </p>
                                </div>
                                <button onClick={handleRefreshMissingIcons} disabled={isRefreshingAll} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500 disabled:opacity-50">
                                    <RefreshIcon className={`w-4 h-4 ${isRefreshingAll ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>
                            <div className="border-t border-gray-600/50"></div>
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="font-semibold text-gray-100">Manage Inactive Feeds</h4>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Review and unsubscribe from feeds that haven't posted recently.
                                    </p>
                                </div>
                                <button onClick={handleManageInactiveClick} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500">
                                    <ZapOffIcon className="w-4 h-4" />
                                    Manage
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-6 flex justify-end flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};