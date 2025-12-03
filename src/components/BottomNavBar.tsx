import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { YouTubeIcon, RssIcon, SettingsIcon } from './icons';

// NavButton component moved outside to avoid creating components during render
const NavButton: React.FC<{
  onClick: () => void;
  isActive: boolean;
  icon: React.ReactNode;
  label: string;
}> = ({ onClick, isActive, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center flex-1 py-2 text-xs font-medium transition-colors ${
      isActive ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
    }`}
  >
    {icon}
    <span className="mt-1">{label}</span>
  </button>
);

export const BottomNavBar: React.FC = () => {
  const {
    onToggleSidebar,
    sidebarTab,
    handleSetSidebarTab,
    handleViewChange,
    enableRssAndReddit,
    setIsActionsMenuOpen,
  } = useAppContext();

  const handleTabClick = (tab: 'yt' | 'rss') => {
    if (sidebarTab === tab) {
      // If tapping the active tab, toggle the sidebar to show navigation within that tab
      onToggleSidebar();
    } else {
      // If tapping an inactive tab, switch to it and show its main grid view
      handleSetSidebarTab(tab);
      handleViewChange('all-subscriptions');
    }
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 z-40 md:hidden">
      <div className="flex justify-around items-center h-16">
        <NavButton
          onClick={() => handleTabClick('yt')}
          isActive={sidebarTab === 'yt'}
          icon={<YouTubeIcon className="w-6 h-6" />}
          label="YouTube"
        />
        {enableRssAndReddit && (
          <NavButton
            onClick={() => handleTabClick('rss')}
            isActive={sidebarTab === 'rss'}
            icon={<RssIcon className="w-6 h-6" />}
            label="RSS"
          />
        )}
        <NavButton
          onClick={() => setIsActionsMenuOpen(true)}
          isActive={false}
          icon={<SettingsIcon className="w-6 h-6" />}
          label="Actions"
        />
      </div>
    </footer>
  );
};
