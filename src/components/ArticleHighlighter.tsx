import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Highlight } from '../types';

const HIGHLIGHT_COLORS = [
  { id: 'yellow', bg: 'rgba(250, 204, 21, 0.35)', border: 'rgba(250, 204, 21, 0.6)', dot: 'bg-yellow-400' },
  { id: 'green', bg: 'rgba(74, 222, 128, 0.35)', border: 'rgba(74, 222, 128, 0.6)', dot: 'bg-green-400' },
  { id: 'blue', bg: 'rgba(96, 165, 250, 0.35)', border: 'rgba(96, 165, 250, 0.6)', dot: 'bg-blue-400' },
  { id: 'pink', bg: 'rgba(244, 114, 182, 0.35)', border: 'rgba(244, 114, 182, 0.6)', dot: 'bg-pink-400' },
  { id: 'purple', bg: 'rgba(192, 132, 252, 0.35)', border: 'rgba(192, 132, 252, 0.6)', dot: 'bg-purple-400' },
] as const;

export const getHighlightColorStyle = (color: string) => {
  return HIGHLIGHT_COLORS.find(c => c.id === color) || HIGHLIGHT_COLORS[0];
};

interface FloatingToolbarProps {
  position: { x: number; y: number };
  onColorSelect: (color: string) => void;
  onAddNote: () => void;
  onClose: () => void;
}

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ position, onColorSelect, onAddNote, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Small delay so the opening click doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl px-2 py-1.5"
      style={{ left: position.x, top: position.y - 48 }}
    >
      {HIGHLIGHT_COLORS.map(color => (
        <button
          key={color.id}
          onClick={() => onColorSelect(color.id)}
          className={`w-6 h-6 rounded-full ${color.dot} hover:ring-2 hover:ring-white transition-all`}
          title={color.id}
        />
      ))}
      <div className="w-px h-5 bg-gray-600 mx-1" />
      <button
        onClick={onAddNote}
        className="px-2 py-1 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
        title="Add annotation"
      >
        Note
      </button>
    </div>
  );
};

interface NoteInputProps {
  highlightId: string;
  initialNote: string;
  onSave: (id: string, note: string) => void;
  onCancel: () => void;
}

const NoteInput: React.FC<NoteInputProps> = ({ highlightId, initialNote, onSave, onCancel }) => {
  const [text, setText] = useState(initialNote);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="mt-1 p-2 bg-gray-800 border border-gray-600 rounded-md">
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add a note..."
        className="w-full bg-gray-900 text-gray-200 text-sm p-2 rounded border border-gray-700 focus:border-indigo-500 focus:outline-none resize-none"
        rows={2}
      />
      <div className="flex justify-end gap-2 mt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(highlightId, text)}
          className="px-3 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
};

interface ArticleHighlighterProps {
  articleId: string;
  feedId: string;
  highlights: Highlight[];
  onAddHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => void;
  onRemoveHighlight: (id: string) => void;
  onUpdateHighlightNote: (id: string, note: string) => void;
  children: React.ReactNode;
  scrollToHighlightId?: string | null;
  onScrollToHighlightHandled?: () => void;
}

export const ArticleHighlighter: React.FC<ArticleHighlighterProps> = ({
  articleId,
  feedId,
  highlights,
  onAddHighlight,
  onRemoveHighlight,
  onUpdateHighlightNote,
  children,
  scrollToHighlightId,
  onScrollToHighlightHandled,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<{
    position: { x: number; y: number };
    selectedText: string;
    prefix: string;
  } | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const highlightSpanRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  // Handle text selection → show floating toolbar
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length === 0) return;

    // Make sure selection is within our container
    const range = selection.getRangeAt(0);
    if (!containerRef.current?.contains(range.commonAncestorContainer)) {
      return;
    }

    // Get prefix text (30 chars before the selection)
    const containerText = containerRef.current.textContent || '';
    const textBefore = containerText.substring(
      Math.max(0, containerText.indexOf(selectedText) - 30),
      containerText.indexOf(selectedText)
    );
    const prefix = textBefore.slice(-30);

    // Get position for toolbar
    const rect = range.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - 100;
    const y = rect.top;

    setToolbar({
      position: { x: Math.max(10, x), y },
      selectedText,
      prefix,
    });
  }, []);

  // Clear toolbar on selection change that collapses
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        // Don't close toolbar immediately on collapse — the color buttons need time
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const handleColorSelect = useCallback(
    (color: string) => {
      if (!toolbar) return;
      onAddHighlight({
        articleId,
        feedId,
        text: toolbar.selectedText,
        prefix: toolbar.prefix,
        color,
      });
      setToolbar(null);
      window.getSelection()?.removeAllRanges();
    },
    [toolbar, articleId, feedId, onAddHighlight]
  );

  const handleAddNote = useCallback(() => {
    if (!toolbar) return;
    // First create the highlight with yellow as default
    const tempId = `hl-temp-${Date.now()}`;
    onAddHighlight({
      articleId,
      feedId,
      text: toolbar.selectedText,
      prefix: toolbar.prefix,
      color: 'yellow',
      note: '',
    });
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
    // Open note editing for the just-created highlight
    // We'll find it by matching the text since we don't have the ID yet
    setEditingNoteId(tempId);
    // The actual ID will be different, but we'll use a timeout to find the real one
    setTimeout(() => {
      // Find the most recent highlight for this article with matching text
      setEditingNoteId(null); // Reset temp
    }, 100);
  }, [toolbar, articleId, feedId, onAddHighlight]);

  const handleSaveNote = useCallback(
    (id: string, note: string) => {
      onUpdateHighlightNote(id, note);
      setEditingNoteId(null);
    },
    [onUpdateHighlightNote]
  );

  // Scroll to a specific highlight when requested
  useEffect(() => {
    if (!scrollToHighlightId) return;
    const el = highlightSpanRefs.current.get(scrollToHighlightId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash effect
      el.classList.add('ring-2', 'ring-white');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-white');
      }, 1500);
    }
    onScrollToHighlightHandled?.();
  }, [scrollToHighlightId, onScrollToHighlightHandled]);

  // Re-render highlights into the DOM after content updates
  useEffect(() => {
    if (!containerRef.current || highlights.length === 0) return;

    const articleHighlights = highlights.filter(h => h.articleId === articleId);
    if (articleHighlights.length === 0) return;

    // Use TreeWalker to find and wrap text nodes
    const walker = document.createTreeWalker(
      containerRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent && node.textContent.trim().length > 0) {
        textNodes.push(node);
      }
    }

    for (const highlight of articleHighlights) {
      // Check if this highlight is already rendered
      if (containerRef.current.querySelector(`[data-highlight-id="${highlight.id}"]`)) {
        continue;
      }

      const searchText = highlight.text;
      if (!searchText) continue;

      // Try to find the text in the text nodes, optionally matching prefix
      for (const textNode of textNodes) {
        const nodeText = textNode.textContent || '';
        const idx = nodeText.indexOf(searchText);
        if (idx === -1) continue;

        // Verify prefix match if available
        if (highlight.prefix) {
          const nodePrefix = nodeText.substring(Math.max(0, idx - highlight.prefix.length), idx);
          if (!nodePrefix.endsWith(highlight.prefix)) continue;
        }

        try {
          const range = document.createRange();
          range.setStart(textNode, idx);
          range.setEnd(textNode, idx + searchText.length);

          const span = document.createElement('span');
          span.setAttribute('data-highlight-id', highlight.id);
          span.setAttribute('data-highlight-color', highlight.color);
          span.className = 'highlight-marker rounded-sm transition-all cursor-pointer';
          const colorStyle = getHighlightColorStyle(highlight.color);
          span.style.backgroundColor = colorStyle.bg;
          span.style.borderBottom = `2px solid ${colorStyle.border}`;

          span.addEventListener('click', (e) => {
            e.stopPropagation();
            setEditingNoteId(highlight.id);
          });

          range.surroundContents(span);
          highlightSpanRefs.current.set(highlight.id, span);

          // Update textNodes list since we modified the DOM
          break;
        } catch (e) {
          // surroundContents can fail if range crosses element boundaries
          console.warn('Highlight: could not wrap text node', e);
          break;
        }
      }
    }

    // Clean up refs for removed highlights
    for (const [id] of highlightSpanRefs.current) {
      if (!articleHighlights.find(h => h.id === id)) {
        highlightSpanRefs.current.delete(id);
      }
    }
  }, [highlights, articleId, children]);

  // Remove highlight markers from DOM when highlights are deleted
  useEffect(() => {
    if (!containerRef.current) return;
    const articleHighlights = highlights.filter(h => h.articleId === articleId);
    const activeIds = new Set(articleHighlights.map(h => h.id));

    const markers = containerRef.current.querySelectorAll('.highlight-marker');
    markers.forEach(marker => {
      const id = marker.getAttribute('data-highlight-id');
      if (id && !activeIds.has(id)) {
        // Unwrap the span
        const parent = marker.parentNode;
        while (marker.firstChild) {
          parent?.insertBefore(marker.firstChild, marker);
        }
        parent?.removeChild(marker);
      }
    });
  }, [highlights, articleId]);

  // Find the highlight being edited — use most recent if temp ID
  const editingHighlight = editingNoteId
    ? highlights.filter(h => h.articleId === articleId).find(h => h.id === editingNoteId) ||
      // If temp ID, find the most recently created highlight for this article with empty note
      highlights
        .filter(h => h.articleId === articleId && h.note === undefined)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
    : null;

  return (
    <div ref={containerRef} onMouseUp={handleMouseUp} className="relative">
      {children}
      {toolbar && (
        <FloatingToolbar
          position={toolbar.position}
          onColorSelect={handleColorSelect}
          onAddNote={handleAddNote}
          onClose={() => setToolbar(null)}
        />
      )}
      {editingHighlight && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setEditingNoteId(null)}>
          <div onClick={e => e.stopPropagation()} className="w-80">
            <NoteInput
              highlightId={editingHighlight.id}
              initialNote={editingHighlight.note || ''}
              onSave={handleSaveNote}
              onCancel={() => setEditingNoteId(null)}
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => {
                  onRemoveHighlight(editingHighlight.id);
                  setEditingNoteId(null);
                }}
                className="px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
              >
                Delete Highlight
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArticleHighlighter;
