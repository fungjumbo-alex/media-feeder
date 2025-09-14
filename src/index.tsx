import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AppProvider } from './contexts/AppContext';

console.log('[DEBUG] index.tsx: Script executing.');

// Intercept console messages to hide specific third-party warnings.
// This is a targeted workaround for a benign but noisy message from the Google Sign-In library.
const originalLog = console.log;
console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Cross-Origin-Opener-Policy')) {
        return;
    }
    originalLog(...args);
};

const originalWarn = console.warn;
console.warn = (...args) => {
    // This is a targeted workaround for a benign but noisy deprecation warning from a CSS dependency.
    if (typeof args[0] === 'string' && args[0].includes('-ms-high-contrast')) {
        return;
    }
    originalWarn(...args);
};

// Intercept console.error to catch specific, actionable GSI errors and notify the user.
const originalError = console.error;
console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('[GSI_LOGGER]: The given origin is not allowed')) {
        // This specific error means the Google Cloud project's OAuth settings are misconfigured.
        // We dispatch a custom event so the UI can show a helpful, specific error toast.
        window.dispatchEvent(new CustomEvent('gsi_auth_error', {
            detail: {
                message: "Sign-in failed: This app's URL is not authorized. Please add your URL (origin) to the 'Authorized JavaScript origins' list in your Google Cloud project's OAuth settings."
            }
        }));
    }
    originalError(...args);
};

// Add a global handler for unhandled promise rejections to catch specific, benign errors.
window.addEventListener('unhandledrejection', (event) => {
    // This error often originates from third-party scripts (like GSI) in an extension-like environment.
    // It's benign and can be safely ignored to prevent console noise.
    if (event.reason && typeof event.reason.message === 'string' && event.reason.message.includes('Receiving end does not exist')) {
        console.warn('Caught and ignored a benign extension messaging error.');
        event.preventDefault();
    }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('[DEBUG] index.tsx: Root element #root not found!');
  throw new Error("Could not find root element to mount to");
}

console.log('[DEBUG] index.tsx: Root element found. Mounting React app.');
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
console.log('[DEBUG] index.tsx: React render initiated.');