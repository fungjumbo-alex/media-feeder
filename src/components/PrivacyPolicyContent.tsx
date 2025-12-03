import React from 'react';
import { useAppContext } from '../contexts/AppContext';

export const PrivacyPolicyContent: React.FC = () => {
  const { handleViewChange } = useAppContext();

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 p-6 sm:p-8">
      <div className="max-w-3xl mx-auto bg-gray-800 p-6 sm:p-8 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-white mb-4">Privacy Policy for Media-Feeder</h1>
        <p className="text-sm text-gray-500 mb-6">Last Updated: July 29, 2025</p>

        <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-headings:text-gray-200 prose-a:text-indigo-400 prose-strong:text-white">
          <p>
            Welcome to Media-Feeder. This Privacy Policy explains how we handle your information
            when you use our application. We are committed to protecting your privacy and ensuring
            transparency about how we use Google user data.
          </p>

          <h2 className="text-xl font-semibold mt-6 mb-3">1. Google User Data We Access and Why</h2>
          <p>
            Media-Feeder is a client-side application. To provide certain features, we request your
            consent to access specific Google user data. We only request the minimum permissions
            necessary for the app to function as described.
          </p>
          <ul>
            <li>
              <strong>View your email address (`.../auth/userinfo.email`)</strong>:
              <br />
              <strong>Purpose:</strong> This permission is required to identify you and display
              which Google account is currently signed into the application. This is shown in the
              settings menu for your reference. We do not use your email address for marketing,
              communications, or any other purpose.
            </li>
            <li>
              <strong>View your YouTube account (`.../auth/youtube.readonly`)</strong>:
              <br />
              <strong>Purpose:</strong> This permission is required for the "Import from YouTube"
              feature, which fetches your list of channel subscriptions. It is also used to reliably
              refresh YouTube playlists. This is a read-only permission; the app cannot modify your
              YouTube account.
            </li>
            <li>
              <strong>Manage your YouTube account (`.../auth/youtube.force-ssl`)</strong>:
              <br />
              <strong>Purpose:</strong> This permission is used for one specific action: to **"like"
              a video** on your behalf when you click the "Like" button within the app or enable the
              "Auto-like" feature. The app does not view, edit, or delete any of your other YouTube
              content or data. The "force-ssl" part ensures all communication with YouTube is
              secure.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-6 mb-3">2. Data Storage and Protection</h2>
          <p>
            We take the protection of your data seriously. Our primary data protection mechanism is
            that **all your data is stored locally on your device within your web browser's
            `localStorage`**.
          </p>
          <ul>
            <li>
              <strong>No Central Servers:</strong> Media-Feeder does not have a backend server. We
              do not collect, store, or transmit your personal data, including your Google user
              data, to any servers we control.
            </li>
            <li>
              <strong>Local Control:</strong> Your data (subscribed feeds, articles, settings, and
              Google account tokens) remains on your computer under your control. It is not
              accessible to us or any third party.
            </li>
            <li>
              <strong>Secure Handling of Sensitive Data:</strong> Access tokens granted by Google
              are also stored in `localStorage`. These tokens are used exclusively for making
              authorized API calls to Google's services from your browser, as described above. They
              are not sent anywhere else. All communication with Google's APIs is performed over
              secure HTTPS connections.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-6 mb-3">3. Data Retention and Deletion</h2>
          <ul>
            <li>
              <strong>Data Retention:</strong> Since all application data is stored locally on your
              device, it is retained indefinitely until you choose to delete it. The data will
              persist across browser sessions but will be removed if you clear your browser's cache
              and site data for this application.
            </li>
            <li>
              <strong>Data Deletion:</strong> You have complete control over your data. You can
              permanently delete all your application data stored in the browser at any time by
              using the **"Clear All Data" (Factory Reset)** option in the app's settings menu. You
              can also revoke the app's access to your Google Account at any time from your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Account permissions page
              </a>
              , which will prevent the app from accessing any further Google data.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-6 mb-3">4. Third-Party Services</h2>
          <p>To function, Media-Feeder relies on several public, third-party services:</p>
          <ul>
            <li>
              <strong>CORS Proxies & Public APIs (e.g., Invidious)</strong>: To fetch RSS feeds and
              public YouTube data without requiring you to install a browser extension, the app uses
              public proxy services. Your requests to these services are proxied, but your personal
              account information is not shared with them.
            </li>
            <li>
              <strong>Paste Services (e.g., dpaste.org)</strong>: The "Share via Link" feature works
              by uploading a compressed, anonymous backup of your feeds and settings to a public
              paste service to generate a shareable link.
            </li>
          </ul>
          <p>
            We do not control the privacy policies of these third-party services. We recommend
            reviewing their policies if you have concerns.
          </p>

          <h2 className="text-xl font-semibold mt-6 mb-3">5. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes
            by posting the new Privacy Policy on this page.
          </p>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => handleViewChange('all-subscriptions')}
            className="px-6 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors"
          >
            Back to App
          </button>
        </div>
      </div>
    </div>
  );
};
