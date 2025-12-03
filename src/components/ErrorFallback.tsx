import React from 'react';

interface ErrorFallbackProps {
  error: Error;
  resetError?: () => void;
  componentName?: string;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError,
  componentName,
}) => {
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-red-500/20">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-6 w-6 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-400">
            {componentName ? `Error in ${componentName}` : 'Component Error'}
          </h3>
          <div className="mt-2 text-sm text-gray-300">
            <p>Something went wrong while rendering this section.</p>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-300">
              Technical details
            </summary>
            <pre className="mt-2 text-xs text-red-400 bg-gray-900 p-2 rounded overflow-auto max-h-32">
              {error.toString()}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
          {resetError && (
            <div className="mt-4">
              <button
                onClick={resetError}
                className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-md transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
