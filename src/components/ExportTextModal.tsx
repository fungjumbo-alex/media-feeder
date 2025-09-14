import React, { useState, useCallback, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, CopyIcon, ClipboardCheckIcon, ClipboardTextIcon } from './icons';

export const ExportTextModal: React.FC = () => {
    const { isExportTextModalOpen, setIsExportTextModalOpen, exportTextContent } = useAppContext();
    const [copyButtonText, setCopyButtonText] = useState('Copy to Clipboard');

    const isOpen = isExportTextModalOpen;

    const onClose = useCallback(() => {
        setIsExportTextModalOpen(false);
    }, [setIsExportTextModalOpen]);
    
    useEffect(() => {
        if (isOpen) {
            setCopyButtonText('Copy to Clipboard');
        }
    }, [isOpen]);

    const handleCopy = () => {
        navigator.clipboard.writeText(exportTextContent).then(() => {
            setCopyButtonText('Copied!');
            setTimeout(() => setCopyButtonText('Copy to Clipboard'), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            setCopyButtonText('Error!');
        });
    };

    if (!isOpen) return null;

    const Icon = copyButtonText === 'Copied!' ? ClipboardCheckIcon : CopyIcon;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl m-4 relative flex flex-col max-h-[90vh]">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    <XIcon className="w-6 h-6" />
                </button>
                <div className="flex items-center mb-4 flex-shrink-0">
                    <ClipboardTextIcon className="w-8 h-8 mr-3 text-indigo-400" />
                    <h2 className="text-xl font-bold text-white">Export Channels as Text</h2>
                </div>
                <p className="text-gray-400 mb-4 flex-shrink-0">
                    Here is your channels-only JSON data. You can copy it to your clipboard for backup or sharing.
                </p>
                <div className="flex-grow flex flex-col min-h-0">
                    <textarea
                        value={exportTextContent}
                        readOnly
                        className="w-full h-full bg-gray-900 border border-gray-700 text-white rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition font-mono text-sm"
                        spellCheck="false"
                    />
                </div>
                <div className="mt-6 flex justify-end space-x-4 flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600">Close</button>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 flex items-center gap-2"
                    >
                        <Icon className="w-5 h-5" />
                        {copyButtonText}
                    </button>
                </div>
            </div>
        </div>
    );
};