import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, ExportIcon, LinkIcon, CopyIcon, ClipboardCheckIcon } from './icons';
import { generateOpml } from '../utils/opmlUtils';

export const ExportModal: React.FC = () => {
  const {
    isExportModalOpen,
    setIsExportModalOpen,
    handleExportFeeds,
    allTags,
    handleShareToCloudLink,
    feeds,
    setToast,
  } = useAppContext();

  const [isSharing, setIsSharing] = useState(false);
  const [sharingTag, setSharingTag] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copyCodeButtonText, setCopyCodeButtonText] = useState('Copy Code');
  const [copyLinkButtonText, setCopyLinkButtonText] = useState('Copy Full Link');
  const [selectedTagForExport, setSelectedTagForExport] = useState<string>('');

  const isOpen = isExportModalOpen;
  const onClose = () => setIsExportModalOpen(false);

  useEffect(() => {
    if (!isOpen) {
      // Reset states when modal closes
      setShareLink(null);
      setShareCode(null);
      setShareError(null);
    }
  }, [isOpen]);

  const handleExportOpml = () => {
    if (!feeds || feeds.length === 0) {
      setToast({ message: 'No subscriptions to export.', type: 'error' });
      return;
    }
    const opmlString = generateOpml(feeds);
    const blob = new Blob([opmlString], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `media-feeder-subscriptions_${date}.opml`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: 'OPML file has been created.', type: 'success' });
    onClose();
  };

  if (!isOpen) return null;

  const handleShareClick = async (tag?: string) => {
    setIsSharing(true);
    setSharingTag(tag || 'all');
    setShareLink(null);
    setShareCode(null);
    setShareError(null);
    setCopyCodeButtonText('Copy Code');
    setCopyLinkButtonText('Copy Full Link');
    try {
      const { fullUrl, shortCode } = await handleShareToCloudLink({ tag });
      setShareLink(fullUrl);
      setShareCode(shortCode);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setShareError(message);
    } finally {
      setIsSharing(false);
      setSharingTag(null);
    }
  };

  const handleCopyShareCode = () => {
    if (!shareCode) return;
    navigator.clipboard
      .writeText(shareCode)
      .then(() => {
        setCopyCodeButtonText('Copied!');
        setTimeout(() => setCopyCodeButtonText('Copy Code'), 2000);
      })
      .catch(err => {
        console.error('Failed to copy code: ', err);
        setCopyCodeButtonText('Error!');
      });
  };

  const handleCopyLink = () => {
    if (!shareLink) return;
    navigator.clipboard
      .writeText(shareLink)
      .then(() => {
        setCopyLinkButtonText('Copied!');
        setTimeout(() => setCopyLinkButtonText('Copy Full Link'), 2000);
      })
      .catch(err => {
        console.error('Failed to copy link: ', err);
        setCopyLinkButtonText('Error!');
      });
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
      className={`w-full px-4 py-2.5 rounded-md text-white font-semibold transition-colors text-sm flex items-center justify-center gap-2 ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg m-4 relative flex flex-col max-h-[90vh] p-4 sm:p-6">
        <header className="flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <XIcon className="w-6 h-6" />
          </button>
          <div className="flex items-center mb-4">
            <ExportIcon className="w-8 h-8 mr-3 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Export & Share Data</h2>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4 sm:space-y-6">
          <div>
            <h3 className="text-base font-semibold text-gray-200 mb-2">One-Time Share Link</h3>
            <p className="text-sm text-gray-400 mb-4">
              Generate a unique code to easily clone your setup to another device. The link expires
              in 24 hours.
            </p>
            <ActionButton
              onClick={() => handleShareClick()}
              disabled={isSharing}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
            >
              {isSharing && sharingTag === 'all' ? (
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <LinkIcon className="w-5 h-5" />
              )}
              {isSharing && sharingTag === 'all' ? 'Generating...' : 'Share All Feeds'}
            </ActionButton>

            {shareCode && shareLink && (
              <div className="mt-4 bg-gray-900/50 p-4 rounded-lg flex flex-col items-center gap-4">
                <p className="text-sm text-gray-400">Share this short code:</p>
                <div className="w-full flex items-center gap-2">
                  <input
                    type="text"
                    value={shareCode}
                    readOnly
                    className="w-full bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-md px-2 py-1.5 focus:outline-none text-center font-mono tracking-wider"
                  />
                  <button
                    onClick={handleCopyShareCode}
                    className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-600 hover:bg-gray-500 text-white"
                  >
                    {copyCodeButtonText === 'Copied!' ? (
                      <ClipboardCheckIcon className="w-4 h-4" />
                    ) : (
                      <CopyIcon className="w-4 h-4" />
                    )}
                    {copyCodeButtonText}
                  </button>
                </div>
                <p className="text-sm text-gray-400">Or scan the QR code:</p>
                <div className="bg-white p-2 rounded-md">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareLink)}&bgcolor=FFFFFF`}
                    alt="Share Link QR Code"
                    width="150"
                    height="150"
                  />
                </div>
                <button
                  onClick={handleCopyLink}
                  className="text-xs text-gray-500 hover:text-gray-300 underline"
                >
                  {copyLinkButtonText}
                </button>
              </div>
            )}
            {shareError && <p className="mt-2 text-sm text-red-400">{shareError}</p>}
          </div>

          <div>
            <h3 className="text-base font-semibold text-gray-200 mb-2">Full Backup (to File)</h3>
            <p className="text-sm text-gray-400 mb-4">
              Saves all your data (including articles and settings) to a <code>.json</code> file.
            </p>
            <ActionButton
              onClick={() => handleExportFeeds({})}
              className="bg-gray-700 hover:bg-gray-600"
            >
              Download Full Backup
            </ActionButton>
          </div>

          <div>
            <h3 className="text-base font-semibold text-gray-200 mb-2">
              Subscriptions Only (OPML)
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Saves just your feed subscriptions to a standard <code>.opml</code> file, compatible
              with other feed readers.
            </p>
            <ActionButton onClick={handleExportOpml} className="bg-gray-700 hover:bg-gray-600">
              Download as OPML
            </ActionButton>
          </div>

          {allTags.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-200 mb-2">Tag-Specific Export</h3>
              <p className="text-sm text-gray-400 mb-4">
                Export or share only the feeds that have a specific tag.
              </p>
              <div className="relative">
                <select
                  value={selectedTagForExport}
                  onChange={e => setSelectedTagForExport(e.target.value)}
                  className="w-full bg-gray-700 text-white font-semibold py-2.5 pl-3 pr-8 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Select a Tag --</option>
                  {allTags.map(tag => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                  <svg
                    className="fill-current h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>
              {selectedTagForExport && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ActionButton
                    onClick={() => handleExportFeeds({ tag: selectedTagForExport })}
                    className="bg-gray-700 hover:bg-gray-600"
                  >
                    <ExportIcon className="w-5 h-5" />
                    Download File
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleShareClick(selectedTagForExport)}
                    disabled={isSharing}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400/50"
                  >
                    {isSharing && sharingTag === selectedTagForExport ? (
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <LinkIcon className="w-5 h-5" />
                    )}
                    {isSharing && sharingTag === selectedTagForExport
                      ? 'Generating...'
                      : 'Share Link'}
                  </ActionButton>
                </div>
              )}
            </div>
          )}
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
