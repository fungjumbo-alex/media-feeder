
import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, YouTubeIcon } from './icons';

export const ConfirmAddVideoOrChannelModal: React.FC = () => {
    const { videoToAdd, handleConfirmAddChannel, handleConfirmAddSingleVideo, handleCancelAddVideoOrChannel } = useAppContext();

    const isOpen = !!videoToAdd;
    const onClose = () => handleCancelAddVideoOrChannel();

    if (!isOpen || !videoToAdd) return null;

    const video = videoToAdd;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg m-4 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><XIcon className="w-6 h-6" /></button>
                <h2 className="text-xl font-bold text-white mb-4">Add YouTube Content</h2>
                <p className="text-gray-400 mb-6">You've provided a link to a single video. What would you like to add?</p>

                <div className="bg-gray-700/50 p-4 rounded-lg flex items-start gap-4 mb-6">
                    <img src={video.imageUrl || ''} alt={video.title} className="w-32 h-18 object-cover rounded bg-gray-700 flex-shrink-0" />
                    <div className="flex-grow min-w-0">
                        <p className="text-sm text-gray-400">Video:</p>
                        <p className="font-semibold text-gray-100 truncate" title={video.title}>{video.title}</p>
                        <p className="text-sm text-gray-400 mt-2">From Channel:</p>
                        <p className="font-semibold text-gray-100 truncate" title={video.feedTitle}>{video.feedTitle}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                        onClick={() => handleConfirmAddSingleVideo(video)}
                        className="w-full text-left p-4 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-indigo-500 transition-colors"
                    >
                        <h3 className="font-semibold text-gray-100">Add Just This Video</h3>
                        <p className="text-sm text-gray-400 mt-1">
                            Adds only this video to your library.
                        </p>
                    </button>
                    <button
                        onClick={() => handleConfirmAddChannel(video.feedId, video.feedTitle)}
                        className="w-full text-left p-4 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-indigo-500 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <YouTubeIcon className="w-5 h-5 text-red-500" />
                            <h3 className="font-semibold text-gray-100">Add Channel</h3>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                            Subscribes you to the entire channel: "{video.feedTitle}".
                        </p>
                    </button>
                </div>

                <div className="mt-6 flex justify-end">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-gray-300 bg-gray-700/50 hover:bg-gray-600">Cancel</button>
                </div>
            </div>
        </div>
    );
};
