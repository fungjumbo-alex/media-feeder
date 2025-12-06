import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import {
  XIcon,
  SettingsIcon,
  RefreshIcon,
  ZapOffIcon,
  BarChartIcon,
  GoogleIcon,
  TagsIcon,
  TrashIcon,
  SparklesIcon,
  InfoIcon,
  HelpIcon,
  ChevronDownIcon,
} from './icons';
import { TRANSLATION_LANGUAGES } from '../types';

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
    autoUploadAfterRefresh,
    handleToggleAutoUploadAfterRefresh,
    autoSummarizeOnRefresh,
    handleToggleAutoSummarizeOnRefresh,
    autoClusterOnRefresh,
    handleToggleAutoClusterOnRefresh,
    autoTranscribeOnRefresh,
    handleToggleAutoTranscribeOnRefresh,
    driveSyncStatus,
    handleRefreshMissingIcons,
    handleViewChange,
    isRefreshingAll,
    setIsAdvancedInfoModalOpen,
    handleOpenBulkEdit,
    handleOpenClearDataModal,
    startDemo,
    userProfile,
    handleGoogleSignIn,
    handleGoogleSignOut,
    defaultAiLanguage,
    setDefaultAiLanguage,
    accessToken,
    isAiDisabled,
    autoAiTimeWindowDays,
    setAutoAiTimeWindowDays,
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

  const handleBulkEditClick = () => {
    handleOpenBulkEdit();
    onClose();
  };

  const handleClearDataClick = () => {
    handleOpenClearDataModal();
    onClose();
  };

  const handleDemoClick = () => {
    startDemo();
    onClose();
  };

  const handleInfoClick = (page: 'about' | 'help' | 'privacy-policy') => {
    handleViewChange(page);
    onClose();
  };

  const isDriveSyncReady = accessToken && driveSyncStatus.status === 'ready';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg m-4 relative max-h-[90vh] flex flex-col">
        <header className="flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
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
            <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">
              Account
            </h3>
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
                      Connect your account to like videos, import subscriptions, and sync data with
                      Google Drive.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      handleGoogleSignIn();
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
            <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">
              Automation
            </h3>
            <div className="bg-gray-700/50 p-4 rounded-lg space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-gray-100">Auto-like Opened YouTube Videos</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Automatically "like" any YouTube video you open. Requires being signed in to
                    Google.
                  </p>
                </div>
                <label
                  htmlFor="auto-like-toggle"
                  className="relative inline-flex items-center cursor-pointer"
                >
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
                  <label
                    htmlFor="auto-like-delay"
                    className="block text-sm font-medium text-gray-300 mb-1"
                  >
                    Auto-like Delay (seconds)
                  </label>
                  <input
                    type="number"
                    id="auto-like-delay"
                    value={autoLikeDelaySeconds}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 0) setAutoLikeDelaySeconds(val);
                    }}
                    className="w-24 bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                    min="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Delay before liking a video after it's opened. Default is 10.
                  </p>
                </div>
              )}
              <div className="border-t border-gray-600/50 pt-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold text-gray-100">Auto-transcribe videos on refresh</h4>
                    <p className="text-xs text-gray-400 mt-1">
                      Automatically fetch transcripts for new YouTube videos after a refresh.
                    </p>
                  </div>
                  <label
                    htmlFor="auto-transcribe-toggle"
                    className="relative inline-flex items-center cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      id="auto-transcribe-toggle"
                      className="sr-only peer"
                      checked={autoTranscribeOnRefresh}
                      onChange={handleToggleAutoTranscribeOnRefresh}
                    />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
              <div className="border-t border-gray-600/50 pt-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4
                      className={`font-semibold transition-colors ${isAiDisabled ? 'text-yellow-400' : 'text-gray-100'}`}
                    >
                      Auto-generate AI summaries on refresh
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">
                      New YouTube videos with transcripts will be automatically summarized after a
                      refresh. This uses your Gemini API quota.
                    </p>
                    {isAiDisabled && (
                      <p className="text-xs text-yellow-500 mt-1">
                        This was automatically disabled due to repeated API quota errors. You can
                        re-enable it.
                      </p>
                    )}
                  </div>
                  <label
                    htmlFor="auto-summarize-toggle"
                    className="relative inline-flex items-center cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      id="auto-summarize-toggle"
                      className="sr-only peer"
                      checked={autoSummarizeOnRefresh}
                      onChange={handleToggleAutoSummarizeOnRefresh}
                    />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
              <div className="border-t border-gray-600/50 pt-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4
                      className={`font-semibold transition-colors ${isAiDisabled ? 'text-yellow-400' : 'text-gray-100'}`}
                    >
                      Auto-generate mindmap on refresh
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">
                      Automatically group recent videos into a mindmap hierarchy after a refresh.
                    </p>
                  </div>
                  <label
                    htmlFor="auto-cluster-toggle"
                    className="relative inline-flex items-center cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      id="auto-cluster-toggle"
                      className="sr-only peer"
                      checked={autoClusterOnRefresh}
                      onChange={handleToggleAutoClusterOnRefresh}
                    />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
              <div className="border-t border-gray-600/50 pt-4">
                <div>
                  <h4 className="font-semibold text-gray-100">Time window for auto AI tasks</h4>
                  <p className="text-xs text-gray-400 mt-1 mb-3">
                    Limit auto-transcription and auto-summary to articles published within the last X days.
                  </p>
                  <div className="flex items-center gap-3">
                    <label htmlFor="time-window-input" className="text-sm text-gray-300">
                      Last
                    </label>
                    <input
                      type="number"
                      id="time-window-input"
                      min="1"
                      max="365"
                      value={autoAiTimeWindowDays}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= 365) {
                          setAutoAiTimeWindowDays(val);
                        }
                      }}
                      className="w-20 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <label htmlFor="time-window-input" className="text-sm text-gray-300">
                      days
                    </label>
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-600/50 pt-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4
                      className={`font-semibold transition-colors ${!isDriveSyncReady ? 'text-gray-500' : 'text-gray-100'}`}
                    >
                      Auto-upload after refresh
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">
                      Automatically upload data to Google Drive after any refresh.
                      {!isDriveSyncReady && (
                        <span className="block text-yellow-500/80">
                          Requires Google Drive sync to be set up.
                        </span>
                      )}
                    </p>
                  </div>
                  <label
                    htmlFor="auto-upload-toggle"
                    className="relative inline-flex items-center cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      id="auto-upload-toggle"
                      className="sr-only peer"
                      checked={autoUploadAfterRefresh}
                      onChange={handleToggleAutoUploadAfterRefresh}
                      disabled={!isDriveSyncReady}
                    />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">
              Feed Settings
            </h3>
            <div className="bg-gray-700/50 p-4 rounded-lg flex justify-between items-center">
              <div>
                <h4 className="font-semibold text-gray-100">Enable RSS & Reddit Feeds</h4>
                <p className="text-xs text-gray-400 mt-1">
                  Allow adding and viewing feeds from general RSS sources and Reddit.
                </p>
              </div>
              <label
                htmlFor="enable-rss-reddit-toggle"
                className="relative inline-flex items-center cursor-pointer"
              >
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
            <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">
              AI & Content
            </h3>
            <div className="bg-gray-700/50 p-4 rounded-lg">
              <div>
                <h4 className="font-semibold text-gray-100">Default AI Language</h4>
                <p className="text-xs text-gray-400 mt-1 mb-3">
                  Choose the default language for AI summaries, digests, and video transcripts.
                </p>
                <div className="relative">
                  <select
                    value={defaultAiLanguage}
                    onChange={e => setDefaultAiLanguage(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition appearance-none"
                    aria-label="Select default AI language"
                  >
                    {TRANSLATION_LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                    <ChevronDownIcon className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">
              Maintenance
            </h3>
            <div className="bg-gray-700/50 p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-gray-100">Stats & Storage</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    View network/proxy statistics and manage local storage.
                  </p>
                </div>
                <button
                  onClick={handleStatsAndStorageClick}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500"
                >
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
                <button
                  onClick={handleRefreshMissingIcons}
                  disabled={isRefreshingAll}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500 disabled:opacity-50"
                >
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
                <button
                  onClick={handleManageInactiveClick}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500"
                >
                  <ZapOffIcon className="w-4 h-4" />
                  Manage
                </button>
              </div>
              <div className="border-t border-gray-600/50"></div>
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-gray-100">Bulk Edit Tags</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Add, set, or favorite tags for multiple feeds at once.
                  </p>
                </div>
                <button
                  onClick={handleBulkEditClick}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500"
                >
                  <TagsIcon className="w-4 h-4" />
                  Edit
                </button>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-2">
              App Info & Help
            </h3>
            <div className="bg-gray-700/50 p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-gray-100">Run Guided Demo</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Get a quick tour of the main features.
                  </p>
                </div>
                <button
                  onClick={handleDemoClick}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500"
                >
                  <SparklesIcon className="w-4 h-4" />
                  Start
                </button>
              </div>
              <div className="border-t border-gray-600/50"></div>
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-gray-100">About Media-Feeder</h4>
                <button
                  onClick={() => handleInfoClick('about')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500"
                >
                  <InfoIcon className="w-4 h-4" />
                  View
                </button>
              </div>
              <div className="border-t border-gray-600/50"></div>
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-gray-100">Help & Guide</h4>
                <button
                  onClick={() => handleInfoClick('help')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500"
                >
                  <HelpIcon className="w-4 h-4" />
                  View
                </button>
              </div>
              <div className="border-t border-gray-600/50"></div>
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-gray-100">Privacy Policy</h4>
                <button
                  onClick={() => handleInfoClick('privacy-policy')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-600 text-white hover:bg-gray-500"
                >
                  <InfoIcon className="w-4 h-4" />
                  View
                </button>
              </div>
              <div className="border-t border-gray-600/50"></div>
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-red-300">Clear Data</h4>
                <button
                  onClick={handleClearDataClick}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-500"
                >
                  <TrashIcon className="w-4 h-4" />
                  Open
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
