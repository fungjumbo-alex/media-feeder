import React, { useState } from 'react';

/**
 * Test component to verify error boundaries work correctly.
 * This component will throw an error when the button is clicked.
 *
 * Usage: Import and add to App.tsx temporarily to test error boundaries.
 * Example: <ErrorBoundary><ErrorTest /></ErrorBoundary>
 */
export const ErrorTest: React.FC = () => {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error('Test error from ErrorTest component!');
  }

  return (
    <div className="p-4 bg-yellow-900/20 border border-yellow-600 rounded-lg">
      <h3 className="text-yellow-400 font-bold mb-2">Error Boundary Test Component</h3>
      <p className="text-gray-300 text-sm mb-3">
        Click the button below to trigger an error and test the error boundary.
      </p>
      <button
        onClick={() => setShouldThrow(true)}
        className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
      >
        Trigger Error
      </button>
    </div>
  );
};
