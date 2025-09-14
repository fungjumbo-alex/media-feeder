
import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, AlertTriangleIcon, XIcon } from './icons';

interface ToastProps {
    message: string;
    type: 'success' | 'error';
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        setVisible(true); // Trigger fade-in
        const timer = setTimeout(() => {
            handleClose();
        }, 5000); // Auto-dismiss after 5 seconds

        return () => clearTimeout(timer);
    }, [message, type]);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 300); // Wait for fade-out animation
    };

    const isSuccess = type === 'success';

    return (
        <div 
            className={`fixed bottom-5 left-1/2 -translate-x-1/2 max-w-md w-full p-4 rounded-lg shadow-lg flex items-center gap-4 z-[9999] transition-all duration-300
                ${isSuccess ? 'bg-green-600/90 text-white' : 'bg-red-600/90 text-white'}
                ${visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
        >
            <div className="flex-shrink-0">
                {isSuccess ? <CheckCircleIcon className="w-6 h-6" /> : <AlertTriangleIcon className="w-6 h-6" />}
            </div>
            <div className="flex-grow">
                <p className="font-semibold">{message}</p>
            </div>
            <button onClick={handleClose} className="p-1 rounded-full hover:bg-white/20 transition-colors flex-shrink-0">
                <XIcon className="w-5 h-5" />
            </button>
        </div>
    );
};
