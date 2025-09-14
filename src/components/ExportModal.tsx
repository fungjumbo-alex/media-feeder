import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, ExportIcon, TagIcon, LinkIcon, CopyIcon, ClipboardCheckIcon } from './icons';

export const ExportModal: React.FC = () => {
    const { isExportModalOpen, setIsExportModalOpen, handleExportFeeds, allTags, handleShareToCloudLink } = useAppContext();
    
    const [isSharing, setIsSharing] = useState(false);
    const [sharingTag, setSharingTag] = useState<string | null>(null);
    const [shareLink, setShareLink] = useState<string | null>(null);
    const [shareError, setShareError] = useState<string | null>(null);
    const [copyButtonText, setCopyButtonText] = useState('Copy');

    const isOpen = isExportModalOpen;
    const onClose = () => setIsExportModalOpen(false);
    
    if (!isOpen) return null;

    const handleShareClick = async (tag?: string) => {
        setIsSharing(true);
        setSharingTag(tag || 'all');
        setShareLink(null);
        setShareError(null);
        setCopyButtonText('Copy');
        try {
            const link = await handleShareToCloudLink({ tag });
            setShareLink(link);
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unknown error occurred.";
            setShareError(message);
        } finally {
            setIsSharing(false);
            setSharingTag(null);
        }
    };

    const handleCopy = () => {
        if (!shareLink) return;
        navigator.clipboard.writeText(shareLink).then(() => {
            setCopyButtonText('Copied!');
        }).catch(err => {
            console.error('Failed to copy link: ', err);
            setCopyButtonText('Error');
        });
    };

    const ActionButton: React.FC<{ onClick: () => void; children: React.ReactNode, className?: string, disabled?: boolean }> = ({ onClick, children, className = '', disabled = false }) => (
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
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                        <XIcon className="w-6 h-6" />
                    </button>
                    <div className="flex items-center mb-4">
                        <ExportIcon className="w-8 h-8 mr-3 text-indigo-400" />
                        <h2 className="text-xl font-bold text-white">Export Data</h2>
                    </div>
                </header>

                <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4 sm:space-y-6">
                    <div>
                        <h3 className="text-base font-semibold text-gray-200 mb-2">Full Backup (to File)</h3>
                        <p className="text-sm text-gray-400 mb-4">Saves all your data (including articles and settings) to a <code>.json</code> file.</p>
                        <ActionButton onClick={() => handleExportFeeds({})} className="bg-indigo-600 hover:bg-indigo-500">Export All</ActionButton>
                    </div>

                    <div className="border-t border-gray-700"></div>

                    <div>
                        <h3 className="text-base font-semibold text-gray-200 mb-2">Share via Link</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Generates a unique link containing a lightweight backup of your feeds and settings. Anyone with the link can import your setup.
                        </p>
                        <div className="flex flex-col space-y-3">
                             <ActionButton onClick={() => handleShareClick()} disabled={isSharing} className="bg-gray-600 hover:bg-gray-500 disabled:opacity-50">
                                {isSharing && sharingTag === 'all' ? 'Generating...' : <><LinkIcon className="w-5 h-5" /> Generate Share Link</>}
                            </ActionButton>
                             {allTags.length > 0 && (
                                <>
                                    <div className="text-xs text-center text-gray-500 pt-2">... or by tag ...</div>
                                    <div className="flex flex-wrap gap-2 justify-center max-h-24 overflow-y-auto p-1">
                                        {allTags.map(tag => (
                                            <button key={tag} onClick={() => handleShareClick(tag)} disabled={isSharing} className="flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors disabled:opacity-50">
                                                {isSharing && sharingTag === tag ? (
                                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                ) : (
                                                    <><TagIcon className="w-4 h-4 mr-1.5" /> {tag}</>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            {shareLink && (
                                <div className="flex items-center gap-2 p-2 bg-gray-900/50 rounded-md">
                                    <input type="text" readOnly value={shareLink} className="flex-grow bg-transparent text-gray-200 text-sm outline-none font-mono" />
                                    <button onClick={handleCopy} className="px-3 py-1 rounded-md text-white bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs flex items-center gap-1">
                                         {copyButtonText === 'Copied!' ? <ClipboardCheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                                        {copyButtonText}
                                    </button>
                                </div>
                            )}
                             {shareError && <p className="text-xs text-red-400 text-center">{shareError}</p>}
                        </div>
                    </div>
                </div>

                 <footer className="mt-6 pt-4 border-t border-gray-700 flex justify-end flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600">
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};
