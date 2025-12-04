import React, { useEffect } from 'react';
import { XIcon } from './icons';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts = [
    {
      category: 'Navigation',
      items: [
        { keys: ['←', '↑'], description: 'Previous article' },
        { keys: ['→', '↓'], description: 'Next article' },
        { keys: ['Enter'], description: 'Open selected article' },
        { keys: ['Esc'], description: 'Close article/modal' },
      ],
    },
    {
      category: 'Actions',
      items: [
        { keys: ['r'], description: 'Refresh current feed/view' },
        { keys: ['s'], description: 'Star/favorite current item' },
        { keys: ['l'], description: 'Add to read later' },
      ],
    },
    {
      category: 'Article View',
      items: [
        { keys: ['Space'], description: 'Play/pause video' },
        { keys: ['←'], description: 'Previous article' },
        { keys: ['→'], description: 'Next article' },
        { keys: ['r'], description: 'Toggle Read Later' },
        { keys: ['l'], description: 'Toggle Like (Video)' },
        { keys: ['t'], description: 'Show Transcript (Video)' },
        { keys: ['a'], description: 'Show AI Summary' },
        { keys: ['c'], description: 'Show Comments' },
        { keys: ['d'], description: 'Show Details' },
      ],
    },
    {
      category: 'General',
      items: [
        { keys: ['?'], description: 'Show this help dialog' },
        { keys: ['/'], description: 'Focus search' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-md hover:bg-gray-700"
            aria-label="Close"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {shortcuts.map(section => (
            <div key={section.category}>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.items.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-700/50 transition-colors"
                  >
                    <span className="text-gray-200">{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <kbd
                          key={keyIdx}
                          className="px-2 py-1 text-xs font-semibold text-gray-200 bg-gray-900 border border-gray-600 rounded shadow-sm min-w-[2rem] text-center"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 p-4">
          <p className="text-sm text-gray-400 text-center">
            Press{' '}
            <kbd className="px-2 py-0.5 text-xs bg-gray-900 border border-gray-600 rounded">
              Esc
            </kbd>{' '}
            or{' '}
            <kbd className="px-2 py-0.5 text-xs bg-gray-900 border border-gray-600 rounded">?</kbd>{' '}
            to close
          </p>
        </div>
      </div>
    </div>
  );
};
