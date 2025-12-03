import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, SyncIcon, GoogleIcon } from './icons';
import { formatRelativeDate } from '../utils/dateUtils';

export const SyncDataModal: React.FC = () => {
  const {
    isSyncDataModalOpen,
    setIsSyncDataModalOpen,
    userProfile,
    handleGoogleSignIn,
    driveSyncStatus,
    handleUploadToDrive,
    handleDownloadFromDrive,
  } = useAppContext();

  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = isSyncDataModalOpen;
  const onClose = () => setIsSyncDataModalOpen(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUploadClick = async () => {
    setIsUploading(true);
    setError(null);
    try {
      await handleUploadToDrive();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload data.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadClick = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      await handleDownloadFromDrive();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download and import data.');
    } finally {
      setIsDownloading(false);
    }
  };

  const ActionButton: React.FC<{
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
  }> = ({ onClick, children, className = '', disabled = false }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-4 py-2.5 rounded-md font-semibold transition-colors text-sm flex items-center justify-center gap-2 ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg m-4 relative flex flex-col max-h-[90vh] p-4 sm:p-6">
        <header>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <XIcon className="w-6 h-6" />
          </button>
          <div className="flex items-center mb-4">
            <SyncIcon className="w-8 h-8 mr-3 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Sync Data</h2>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-6">
          <div>
            <h3 className="text-base font-semibold text-gray-200 mb-2">Google Drive Sync</h3>
            {userProfile ? (
              <>
                {driveSyncStatus.status === 'no_permission' && (
                  <>
                    <p className="text-sm text-yellow-400 mb-4">
                      This app needs permission to access Google Drive for syncing. Please grant
                      access to continue.
                    </p>
                    <ActionButton
                      onClick={() => handleGoogleSignIn({ showConsentPrompt: true })}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white"
                    >
                      Grant Drive Access
                    </ActionButton>
                  </>
                )}
                {driveSyncStatus.status === 'ready' && (
                  <>
                    <p className="text-sm text-gray-400 mb-4">
                      Sync your data across devices using your Google Drive. A file named{' '}
                      <strong>media-feeder-data-v2.json</strong> will be created in your "My Drive"
                      folder.
                    </p>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ActionButton
                        onClick={handleUploadClick}
                        disabled={isUploading}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400/50 text-white"
                      >
                        {isUploading ? 'Uploading...' : 'Upload to Drive'}
                      </ActionButton>
                      <ActionButton
                        onClick={handleDownloadClick}
                        disabled={isDownloading}
                        className="bg-green-600 hover:bg-green-500 disabled:bg-green-400/50 text-white"
                      >
                        {isDownloading ? 'Downloading...' : 'Download from Drive'}
                      </ActionButton>
                    </div>
                    {driveSyncStatus.fileMetadata?.modifiedTime && (
                      <p className="mt-4 text-center text-xs text-gray-500">
                        Last sync:{' '}
                        {formatRelativeDate(
                          new Date(driveSyncStatus.fileMetadata.modifiedTime).getTime()
                        )}
                      </p>
                    )}
                  </>
                )}
                {driveSyncStatus.status === 'checking' && (
                  <p className="text-sm text-gray-400">Checking Drive status...</p>
                )}
                {driveSyncStatus.status === 'error' && (
                  <p className="text-sm text-red-400">{driveSyncStatus.error}</p>
                )}
                {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400 mb-4">
                  Sign in with your Google Account to enable syncing your feeds and settings with
                  Google Drive.
                </p>
                <ActionButton
                  onClick={() => handleGoogleSignIn()}
                  className="bg-white/90 hover:bg-white text-gray-800"
                >
                  <GoogleIcon className="w-5 h-5" /> Sign in with Google
                </ActionButton>
              </>
            )}
          </div>
        </div>

        <footer className="mt-4 pt-4 border-t border-gray-700 flex-shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
