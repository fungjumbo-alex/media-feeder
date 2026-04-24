import React, { useCallback } from 'react';
import type { Highlight } from '../types';
import { getHighlightColorStyle } from './ArticleHighlighter';
import { formatRelativeDate } from '../utils/dateUtils';

interface HighlightListProps {
  highlights: Highlight[];
  articleId: string;
  onScrollToHighlight: (id: string) => void;
  onRemoveHighlight: (id: string) => void;
  onUpdateHighlightNote: (id: string, note: string) => void;
}

export const HighlightList: React.FC<HighlightListProps> = ({
  highlights,
  articleId,
  onScrollToHighlight,
  onRemoveHighlight,
  onUpdateHighlightNote,
}) => {
  const articleHighlights = highlights
    .filter(h => h.articleId === articleId)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (articleHighlights.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-8">
        <p className="mb-2">No highlights yet.</p>
        <p className="text-xs text-gray-600">
          Select text in the article to create a highlight.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {articleHighlights.length} Highlight{articleHighlights.length !== 1 ? 's' : ''}
        </span>
      </div>
      {articleHighlights.map(highlight => (
        <HighlightItem
          key={highlight.id}
          highlight={highlight}
          onScrollTo={() => onScrollToHighlight(highlight.id)}
          onRemove={() => onRemoveHighlight(highlight.id)}
          onUpdateNote={(note) => onUpdateHighlightNote(highlight.id, note)}
        />
      ))}
    </div>
  );
};

interface HighlightItemProps {
  highlight: Highlight;
  onScrollTo: () => void;
  onRemove: () => void;
  onUpdateNote: (note: string) => void;
}

const HighlightItem: React.FC<HighlightItemProps> = ({
  highlight,
  onScrollTo,
  onRemove,
  onUpdateNote,
}) => {
  const colorStyle = getHighlightColorStyle(highlight.color);
  const [isEditingNote, setIsEditingNote] = React.useState(false);
  const [noteText, setNoteText] = React.useState(highlight.note || '');

  const handleSaveNote = useCallback(() => {
    onUpdateNote(noteText);
    setIsEditingNote(false);
  }, [noteText, onUpdateNote]);

  const truncatedText =
    highlight.text.length > 80 ? highlight.text.substring(0, 80) + '…' : highlight.text;

  return (
    <div
      className="group bg-gray-900/50 rounded-lg border border-gray-700/50 hover:border-gray-600 transition-colors overflow-hidden"
    >
      <div
        className="px-3 py-2 cursor-pointer hover:bg-gray-900/80 transition-colors"
        onClick={onScrollTo}
      >
        <div className="flex items-start gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
              colorStyle.dot
            }`}
            style={{ backgroundColor: undefined }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-300 leading-snug break-words" style={{
              backgroundColor: colorStyle.bg,
              display: 'inline',
              padding: '1px 3px',
              borderRadius: '2px',
            }}>
              {truncatedText}
            </p>
            {highlight.note && (
              <p className="text-xs text-gray-400 mt-1.5 italic">
                📝 {highlight.note}
              </p>
            )}
            <p className="text-xs text-gray-600 mt-1">
              {formatRelativeDate(highlight.createdAt)}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center border-t border-gray-700/30 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditingNote(true);
          }}
          className="flex-1 px-2 py-1.5 text-xs text-gray-500 hover:text-indigo-400 hover:bg-gray-700/30 transition-colors"
        >
          {highlight.note ? 'Edit note' : 'Add note'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex-1 px-2 py-1.5 text-xs text-gray-500 hover:text-red-400 hover:bg-gray-700/30 transition-colors"
        >
          Delete
        </button>
      </div>
      {isEditingNote && (
        <div className="px-3 pb-3 pt-1">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note..."
            className="w-full bg-gray-900 text-gray-200 text-sm p-2 rounded border border-gray-700 focus:border-indigo-500 focus:outline-none resize-none"
            rows={2}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-1">
            <button
              onClick={() => {
                setNoteText(highlight.note || '');
                setIsEditingNote(false);
              }}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              className="px-2 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HighlightList;
