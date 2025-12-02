import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileTextIcon, PencilIcon, TrashIcon } from './icons';
import { formatRelativeDate } from '../utils/dateUtils';

export const NotesContent: React.FC = () => {
    const { notesForView, handleOpenNoteEditor, handleDeleteNote } = useAppContext();

    if (notesForView.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 p-8">
                <FileTextIcon className="w-16 h-16 mb-4" />
                <h2 className="text-xl font-semibold text-gray-300">This folder is empty.</h2>
                <p>Save AI summaries from articles to create notes here.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-gray-900 p-6">
            <div className="max-w-4xl mx-auto">
                <div className="space-y-4">
                    {notesForView.map(note => (
                        <div key={note.id} className="bg-gray-800 p-4 rounded-lg shadow-md flex items-start gap-4">
                            <FileTextIcon className="w-6 h-6 text-indigo-400 flex-shrink-0 mt-1" />
                            <div className="flex-grow min-w-0 cursor-pointer group" onClick={() => handleOpenNoteEditor(note)}>
                                <h3 className="font-bold text-lg text-gray-100 truncate group-hover:text-indigo-400 transition-colors">{note.title}</h3>
                                <p className="text-sm text-gray-400 mt-1 line-clamp-2">{note.content.replace(/## |### |\*\*|\[.*?\]\(.*?\)|---/g, '').replace(/^- /g, '')}</p>
                                <p className="text-xs text-gray-500 mt-2">Updated: {formatRelativeDate(note.updatedAt)}</p>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenNoteEditor(note); }}
                                    className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                                    title="Edit Note"
                                >
                                    <PencilIcon className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                                    className="p-2 rounded-full text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                    title="Delete Note"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};