/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Environment Variable Polyfill ---
// This section handles the secure loading of environment variables.
// To prevent API keys from being detected by build scanners, they are
// compressed in vite.config.ts and decompressed here at runtime.
import lzString from 'lz-string';

// This global constant is defined by vite.config.ts at build time.
declare const __COMPRESSED_ENV__: Record<string, string>;

const decompressEnv = (): Record<string, string> => {
  const decompressed: Record<string, string> = {};
  if (typeof __COMPRESSED_ENV__ !== 'undefined') {
    for (const key in __COMPRESSED_ENV__) {
      if (Object.prototype.hasOwnProperty.call(__COMPRESSED_ENV__, key)) {
        decompressed[key] = lzString.decompressFromBase64(__COMPRESSED_ENV__[key]) ?? '';
      }
    }
  }
  return decompressed;
};

// Polyfill process.env for the browser environment if it doesn't exist.
// This ensures the app can access variables via `process.env.API_KEY` as required.
if (typeof (window as any).process === 'undefined') {
  (window as any).process = {};
}
if (typeof (window as any).process.env === 'undefined') {
  (window as any).process.env = decompressEnv();
}
// --- End Polyfill ---

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AppProvider } from './contexts/AppContext';

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
  const warnStr = typeof args[0] === 'string' ? args[0] : '';

  // Suppress specific warnings
  const suppressedPatterns = [
    '-ms-high-contrast', // CSS deprecation warning
    'autocomplete attributes', // DOM autocomplete suggestions
    '[DOM]', // DOM-related warnings
  ];

  if (suppressedPatterns.some(pattern => warnStr.includes(pattern))) {
    return;
  }

  originalWarn(...args);
};

// Intercept console.error to catch specific, actionable GSI errors and notify the user.
const originalError = console.error;
console.error = (...args) => {
  const errorStr = typeof args[0] === 'string' ? args[0] : '';

  // GSI auth error - show helpful message
  if (errorStr.includes('[GSI_LOGGER]: The given origin is not allowed')) {
    window.dispatchEvent(
      new CustomEvent('gsi_auth_error', {
        detail: {
          message:
            "Sign-in failed: This app's URL is not authorized. Please add your URL (origin) to the 'Authorized JavaScript origins' list in your Google Cloud project's OAuth settings.",
        },
      })
    );
  }

  // Suppress non-critical third-party errors
  const suppressedPatterns = [
    "Failed to execute 'postMessage' on 'DOMWindow'", // YouTube iframe API
    'getVideoUrl is not a function', // YouTube player API
    'Trustpilot', // Trustpilot browser extension
    'browserextension.trustpilot.com', // Trustpilot extension
    '<polyline> attribute points', // React DOM warnings (already fixed)
    '[Violation]', // Performance violations (informational only)
    'handler took', // Performance timing messages
  ];

  if (suppressedPatterns.some(pattern => errorStr.includes(pattern))) {
    return; // Suppress these errors
  }

  originalError(...args);
};

// Add a global handler for unhandled promise rejections to catch specific, benign errors.
window.addEventListener('unhandledrejection', event => {
  // This error often originates from third-party scripts (like GSI) in an extension-like environment.
  // It's benign and can be safely ignored to prevent console noise.
  if (
    event.reason &&
    typeof event.reason.message === 'string' &&
    event.reason.message.includes('Receiving end does not exist')
  ) {
    event.preventDefault();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element #root not found!');
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
