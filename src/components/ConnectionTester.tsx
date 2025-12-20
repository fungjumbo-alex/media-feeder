import React, { useState } from 'react';
import { testAllSources, SourceTestResult } from '../services/proxyService';
import { RefreshIcon, CheckCircleIcon, XIcon, ClockIcon } from './icons';

export const ConnectionTester: React.FC = () => {
  const [isTesting, setIsTesting] = useState(false);
  const [results, setResults] = useState<SourceTestResult[]>([]);
  const [progress, setProgress] = useState<string>('');

  const handleTest = async () => {
    setIsTesting(true);
    setResults([]);
    setProgress('Starting tests...');

    try {
      await testAllSources(result => {
        setResults(prev => [...prev, result]);
        setProgress(`Testing ${result.name}...`);
      });
      setProgress('Testing complete.');
    } catch (error) {
      console.error('Test failed:', error);
      setProgress('Test failed unexpectedly.');
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusColor = (status: 'ok' | 'error') => {
    return status === 'ok' ? 'text-green-400' : 'text-red-400';
  };

  const groupedResults = results.reduce(
    (acc, result) => {
      if (!acc[result.type]) acc[result.type] = [];
      acc[result.type].push(result);
      return acc;
    },
    {} as Record<string, SourceTestResult[]>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="font-semibold text-gray-100">Connection Health Check</h4>
          <div className="text-xs text-gray-400 mt-1 min-h-[1.5em]">{progress}</div>
        </div>
        <button
          onClick={handleTest}
          disabled={isTesting}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshIcon className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
          {isTesting ? 'Testing...' : 'Test Connections'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="bg-gray-900/50 rounded-lg p-3 max-h-60 overflow-y-auto border border-gray-700 space-y-4 text-xs">
          {Object.entries(groupedResults).map(([type, typeResults]) => (
            <div key={type}>
              <h5 className="font-bold text-gray-300 uppercase tracking-wider mb-2 sticky top-0 bg-gray-900/90 py-1 backdrop-blur-sm">
                {type}
              </h5>
              <div className="space-y-1">
                {typeResults.map((result, idx) => (
                  <div
                    key={`${result.name}-${idx}`}
                    className="flex items-center justify-between p-2 rounded hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {result.status === 'ok' ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className={`truncate ${getStatusColor(result.status)}`}>
                        {result.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-gray-500 flex-shrink-0 ml-2">
                      {result.message && (
                        <span
                          className="text-red-400/80 max-w-[150px] truncate"
                          title={result.message}
                        >
                          {result.message}
                        </span>
                      )}
                      <div className="flex items-center gap-1 w-16 justify-end">
                        <ClockIcon className="w-3 h-3" />
                        <span>{result.latency}ms</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
