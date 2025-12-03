import React, { useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { XIcon, SparklesIcon } from './icons';

interface DemoStep {
  title: string;
  content: string;
  position: React.CSSProperties;
  highlightSelector?: string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    title: 'Welcome to the Demo!',
    content:
      "This quick tour will guide you through the core features. Let's get started by importing some channels from YouTube.",
    position: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  },
  {
    title: '1. Import from YouTube',
    content:
      "First, open the 'Actions & Settings' menu, then click 'Import from YouTube' to connect your Google account and select channels.",
    position: { bottom: '80px', left: '20px' },
    highlightSelector: '#actions-menu-button',
  },
  {
    title: '2. Organize with Tags',
    content:
      "Now that you have feeds, let's organize them. When viewing a feed, you can use the tag icon in the header to add categories.",
    position: { top: '80px', left: '350px' },
    highlightSelector: '#header-tag-button',
  },
  {
    title: '3. Get Latest Content',
    content:
      'Click the refresh icon in the header to get the latest articles for the current feed. You can also refresh all feeds from the main settings menu.',
    position: { top: '150px', left: '350px' },
    highlightSelector: '#header-refresh-button',
  },
  {
    title: '4. Add Any Source',
    content:
      "You can add any RSS feed, YouTube channel, or Reddit page manually. Find this option in the 'Actions & Settings' menu.",
    position: { bottom: '150px', left: '20px' },
  },
  {
    title: '5. Sync to Another Device',
    content:
      "Use 'Actions & Settings' > 'Export Data' > 'Share via Link' to get a unique URL. Open this URL on another device to clone your entire setup.",
    position: { bottom: '80px', left: '20px' },
    highlightSelector: '#actions-menu-button',
  },
  {
    title: "You're All Set!",
    content:
      "That's a quick look at the main features. Feel free to explore and customize your reading experience. Enjoy!",
    position: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  },
];

export const DemoGuide: React.FC = () => {
  const { isDemoMode, demoStep, handleDemoNext, endDemo } = useAppContext();

  useEffect(() => {
    const cleanupHighlight = () => {
      document
        .querySelectorAll('.demo-highlight')
        .forEach(el => el.classList.remove('demo-highlight'));
    };

    cleanupHighlight();

    if (isDemoMode && demoStep < DEMO_STEPS.length) {
      const currentStep = DEMO_STEPS[demoStep];
      if (currentStep.highlightSelector) {
        const element = document.querySelector(currentStep.highlightSelector);
        if (element) {
          element.classList.add('demo-highlight');
        }
      }
    }

    return cleanupHighlight;
  }, [demoStep, isDemoMode]);

  if (!isDemoMode || demoStep >= DEMO_STEPS.length) {
    return null;
  }

  const currentStep = DEMO_STEPS[demoStep];
  const isLastStep = demoStep === DEMO_STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/30 z-[1000]">
      <div
        className="absolute bg-gray-800 border-2 border-indigo-500 rounded-lg shadow-2xl p-6 w-80 text-white"
        style={currentStep.position}
      >
        <button onClick={endDemo} className="absolute top-2 right-2 text-gray-400 hover:text-white">
          <XIcon className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold text-indigo-400 mb-3 flex items-center">
          <SparklesIcon className="w-5 h-5 mr-2" />
          {currentStep.title}
        </h3>
        <p className="text-sm text-gray-300 mb-4">{currentStep.content}</p>
        <div className="flex justify-between items-center">
          <button onClick={endDemo} className="text-xs text-gray-500 hover:text-gray-300">
            Skip Demo
          </button>
          <button
            onClick={handleDemoNext}
            className="px-4 py-1.5 rounded-md bg-indigo-600 font-semibold hover:bg-indigo-500"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};
