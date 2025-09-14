/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#0ea5e9', // sky-500
        'base-100': '#ffffff',
        'base-200': '#f2f2f2',
        'base-300': '#e5e5e5',
        'base-content': '#1f2937',
        'base-dark-100': '#111827', // gray-900
        'base-dark-200': '#1f2937', // gray-800
        'base-dark-300': '#374151', // gray-700
        'base-dark-content': '#d1d5db', // gray-300
      }
    },
  },
  corePlugins: {
    screenReaders: false,
  },
  plugins: [
    typography,
  ],
}