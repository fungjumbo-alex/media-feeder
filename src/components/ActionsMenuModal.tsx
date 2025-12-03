import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import {
  XIcon,
  RefreshIcon,
  PlusIcon,
  YouTubeIcon,
  PackageIcon,
  CheckCircleIcon,
  SettingsIcon,
  SyncIcon,
  TrendingUpIcon,
} from './icons';

// MenuButton component moved outside to avoid creating components during render
const MenuButton: React.FC<{
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
  isDanger?: boolean;
}> = ({ onClick, icon: Icon, label, disabled = false, isDanger = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center px-3 py-2 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${isDanger ? 'text-red-400 hover:bg-red-500/20' : 'text-gray-200 hover:bg-gray-600'}`}
  >
    <Icon className="w-4 h-4 mr-3" />
    {label}
  </button>
);

export const ActionsMenuModal: React.FC = () => {
  const {
    isActionsMenuOpen,
    setIsActionsMenuOpen,
    // FIX: Add missing property `handleOpenRefreshOptionsModal` to destructuring.
    handleOpenRefreshOptionsModal,
    isRefreshingAll,
    setAddFeedModalOpen,
    setIsImportYouTubeModalOpen,
    setIsBundledChannelsModalOpen,
    handleMarkAllInAllFeedsAsRead,
    setIsAiSettingsModalOpen,
    setIsSyncDataModalOpen,
    isMobileView,
    setIsTrendingKeywordsModalOpen,
  } = useAppContext();

  // This is now a mobile-only component.
  // The popover in the Sidebar handles the desktop view.
  if (!isMobileView) {
    return null;
  }

  const createMenuAction = (action: () => void | Promise<void>) => {
    return () => {
      action();
      setIsActionsMenuOpen(false);
    };
  };

  if (!isActionsMenuOpen) {
    return null;
  }

  const mainContent = (
    <>
      <MenuButton
        onClick={createMenuAction(() => handleOpenRefreshOptionsModal())}
        icon={RefreshIcon}
        label="Refresh Feeds..."
        disabled={isRefreshingAll}
      />
      <MenuButton
        onClick={createMenuAction(() => setIsSyncDataModalOpen(true))}
        icon={SyncIcon}
        label="Sync Data"
      />
      <MenuButton
        onClick={createMenuAction(handleMarkAllInAllFeedsAsRead)}
        icon={CheckCircleIcon}
        label="Mark Everything as Read"
      />
      <div className="my-1 border-t border-gray-700"></div>
      <MenuButton
        onClick={createMenuAction(() => setAddFeedModalOpen(true))}
        icon={PlusIcon}
        label="Follow New Source"
      />
      <MenuButton
        onClick={createMenuAction(() => setIsImportYouTubeModalOpen(true))}
        icon={YouTubeIcon}
        label="Import from YouTube"
      />
      <MenuButton
        onClick={createMenuAction(() => setIsBundledChannelsModalOpen(true))}
        icon={PackageIcon}
        label="Add Channel Bundles"
      />
      <div className="my-1 border-t border-gray-700"></div>
      <MenuButton
        onClick={createMenuAction(() => setIsTrendingKeywordsModalOpen(true))}
        icon={TrendingUpIcon}
        label="Trending Keywords"
      />
      <div className="my-1 border-t border-gray-700"></div>
      <MenuButton
        onClick={createMenuAction(() => setIsAiSettingsModalOpen(true))}
        icon={SettingsIcon}
        label="Settings"
      />
    </>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end">
      <div className="bg-gray-800 w-full max-h-[80vh] rounded-t-lg shadow-xl border-t border-gray-700 flex flex-col">
        <div className="flex justify-between items-center p-4">
          <h2 className="text-lg font-bold text-white">Actions & Settings</h2>
          <button
            onClick={() => setIsActionsMenuOpen(false)}
            className="text-gray-400 hover:text-white"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="px-4 pb-4 space-y-1 overflow-y-auto">{mainContent}</div>
      </div>
    </div>
  );
};
