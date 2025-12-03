import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, ImportIcon } from './icons';
import type { SyncData, Feed } from '../types';
import { parseOpml } from '../utils/opmlUtils';

export const ImportTextModal: React.FC = () => {
  const {
    isImportTextModalOpen,
    setIsImportTextModalOpen,
    handleImportData,
    setToast,
    handleAddFeed,
    handleImportBundledChannels,
    recentShareCodes,
    importCodeFromUrl,
    setImportCodeFromUrl,
  } = useAppContext();
  const [jsonText, setJsonText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const opmlFileInputRef = useRef<HTMLInputElement>(null);

  const onClose = useCallback(() => {
    setIsImportTextModalOpen(false);
  }, [setIsImportTextModalOpen]);

  useEffect(() => {
    if (!isImportTextModalOpen) {
      setJsonText('');
      setError(null);
      setIsImporting(false);
    }
  }, [isImportTextModalOpen]);

  const runImport = useCallback(
    async (textToImport: string) => {
      if (!textToImport) {
        setError('Text area is empty. Paste data or load a file.');
        return;
      }
      setIsImporting(true);
      setError(null);

      const importContent = textToImport.trim();

      // Heuristic: JSON data usually starts with '{' or '['. Everything else is treated as a URL/code.
      if (importContent.startsWith('{') || importContent.startsWith('[')) {
        try {
          const parsedJson = JSON.parse(importContent);

          // Case 1: Full backup file (`{ feeds: [...] }`)
          if (parsedJson.feeds && Array.isArray(parsedJson.feeds)) {
            handleImportData(parsedJson as SyncData);
            onClose();
          }
          // Case 2: Channel list file (`[{ url: ..., title: ... }]`)
          else if (
            Array.isArray(parsedJson) &&
            parsedJson.length > 0 &&
            parsedJson.every(item => item.url && item.title)
          ) {
            handleImportBundledChannels(parsedJson as Omit<Feed, 'id' | 'items' | 'error'>[]);
            onClose();
          } else {
            throw new Error('The provided JSON is not a valid backup or channel list.');
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'An unknown error occurred during JSON parsing.';
          setError(`Failed to import data. Error: ${message}`);
          setIsImporting(false);
        }
      } else {
        // Case 3: Treat as a URL or a share code. `handleAddFeed` handles various formats.
        try {
          await handleAddFeed(importContent);
          onClose();
        } catch (addFeedErr) {
          const message =
            addFeedErr instanceof Error ? addFeedErr.message : 'An unknown error occurred.';
          setError(`Failed to import data. Error: ${message}`);
          setIsImporting(false);
        }
      }
    },
    [handleImportData, handleAddFeed, handleImportBundledChannels, setToast, onClose]
  );

  useEffect(() => {
    if (importCodeFromUrl) {
      setJsonText(importCodeFromUrl);
      // Add a small delay to allow the modal to render before starting the import
      setTimeout(() => {
        runImport(importCodeFromUrl);
        setImportCodeFromUrl(null); // Clear after use
      }, 100);
    }
  }, [importCodeFromUrl, runImport, setImportCodeFromUrl]);

  const handleImportClick = () => {
    runImport(jsonText.trim());
  };

  const handleRecentCodeClick = (code: string) => {
    setJsonText(code);
    runImport(code);
  };

  const handleLoadFromFileClick = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const fileContent = event.target?.result as string;
      if (fileContent) {
        // Directly process the file content instead of populating the text area.
        runImport(fileContent);
      } else {
        setError('The selected file is empty or could not be read.');
      }
    };
    reader.onerror = () => {
      setError('Error reading the file.');
    };
    reader.readAsText(file);

    // Reset the file input so the same file can be selected again
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleLoadFromOpmlClick = () => {
    opmlFileInputRef.current?.click();
  };

  const onOpmlFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const fileContent = event.target?.result as string;
      if (fileContent) {
        setIsImporting(true);
        setError(null);
        try {
          const feedsToImport = parseOpml(fileContent);
          if (feedsToImport.length === 0) {
            setError('The OPML file is valid but contains no subscriptions to import.');
            setIsImporting(false);
            return;
          }
          handleImportBundledChannels(feedsToImport);
          onClose();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'An unknown error occurred during OPML parsing.';
          setError(`Failed to import OPML. Error: ${message}`);
          setIsImporting(false);
        }
      } else {
        setError('The selected OPML file is empty or could not be read.');
      }
    };
    reader.onerror = () => {
      setError('Error reading the OPML file.');
    };
    reader.readAsText(file);

    if (e.target) {
      e.target.value = '';
    }
  };

  if (!isImportTextModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <input
        type="file"
        accept=".json"
        ref={fileInputRef}
        onChange={onFileSelected}
        style={{ display: 'none' }}
      />
      <input
        type="file"
        accept=".opml,.xml"
        ref={opmlFileInputRef}
        onChange={onOpmlFileSelected}
        style={{ display: 'none' }}
      />
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl m-4 relative flex flex-col max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <XIcon className="w-6 h-6" />
        </button>
        <div className="flex items-center mb-4 flex-shrink-0">
          <ImportIcon className="w-8 h-8 mr-3 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">Import Data</h2>
        </div>
        <p className="text-gray-400 mb-4 flex-shrink-0">
          Paste a share code or the content of your <code>.json</code> backup file below, or load a
          backup file from your device.
        </p>
        <div className="flex-grow flex flex-col min-h-0">
          <textarea
            value={jsonText}
            onChange={e => {
              setJsonText(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Paste your share code or JSON backup data here..."
            className="w-full h-full bg-gray-900 border border-gray-700 text-white rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition font-mono text-sm"
            spellCheck="false"
          />
        </div>

        {recentShareCodes && recentShareCodes.length > 0 && (
          <div className="mt-4 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Recent Codes</h3>
            <div className="flex flex-wrap gap-2">
              {recentShareCodes.map(code => (
                <button
                  key={code}
                  onClick={() => handleRecentCodeClick(code)}
                  className="px-3 py-1 rounded-full text-xs font-mono tracking-wider bg-gray-700 text-gray-200 hover:bg-indigo-600 hover:text-white transition-colors"
                  disabled={isImporting}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 text-sm text-red-400 bg-red-900/40 p-3 rounded-md flex-shrink-0">
            {error}
          </div>
        )}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={handleImportClick}
            disabled={isImporting}
            className="w-full px-3 py-2.5 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
          >
            {isImporting ? 'Importing...' : 'Import from Text'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full px-3 py-2.5 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLoadFromFileClick}
            className="w-full px-3 py-2.5 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            Load from JSON File...
          </button>
          <button
            type="button"
            onClick={handleLoadFromOpmlClick}
            className="w-full px-3 py-2.5 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            Load from OPML File...
          </button>
        </div>
      </div>
    </div>
  );
};
