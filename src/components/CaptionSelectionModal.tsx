import React, { useEffect, useState } from 'react';
import { XIcon } from './icons';
import type { CaptionChoice } from '../types';

interface CaptionSelectionModalProps {
    choices: CaptionChoice[];
    onSelect: (choice: CaptionChoice) => void;
    onClose: () => void;
}

export const CaptionSelectionModal: React.FC<CaptionSelectionModalProps> = ({ choices, onSelect, onClose }) => {
    // State to hold the index of the selected choice. Initialize to an invalid index.
    const [selectedIndex, setSelectedIndex] = useState<string>('');

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);
    
    const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedIndex(event.target.value);
    };

    const handleConfirm = () => {
        if (selectedIndex !== '' && choices[parseInt(selectedIndex, 10)]) {
            onSelect(choices[parseInt(selectedIndex, 10)]);
        }
    };

    return (
        <div 
            className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm m-4 flex flex-col" 
            onClick={e => e.stopPropagation()}
        >
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><XIcon className="w-6 h-6" /></button>
            <div className="flex-shrink-0">
                <h2 className="text-xl font-bold text-white mb-4">Select Transcript Language</h2>
                <p className="text-gray-400 mb-6">This video has multiple caption languages. Please choose one to generate the transcript.</p>
            </div>
            
            <div className="mb-6">
                <label htmlFor="caption-select" className="sr-only">Select Language</label>
                <select
                    id="caption-select"
                    value={selectedIndex}
                    onChange={handleSelectChange}
                    className="w-full px-4 py-3 rounded-md bg-gray-900 border border-gray-700 text-white font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                >
                    <option value="" disabled>-- Please choose an option --</option>
                    {choices.map((choice, index) => (
                        <option key={index} value={index}>
                            {choice.label} ({choice.language_code})
                        </option>
                    ))}
                </select>
            </div>
            
            <div className="mt-auto flex justify-end space-x-4">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700 hover:bg-gray-600">
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={selectedIndex === ''}
                    className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400/50 disabled:cursor-not-allowed"
                >
                    Generate Transcript
                </button>
            </div>
        </div>
    );
};
