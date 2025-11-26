import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '../vite-env.d.ts'; // eslint-disable-line no-restricted-imports -- Outside app paths
import '@app/styles/index.css'; // Import global styles
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ColorSchemeScript } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';
import App from '@app/App';
import '@app/i18n'; // Initialize i18next
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { BASE_PATH } from '@app/constants/app';

posthog.init('phc_VOdeYnlevc2T63m3myFGjeBlRcIusRgmhfx6XL5a1iz', {
  api_host: 'https://eu.i.posthog.com',
  defaults: '2025-05-24',
  capture_exceptions: true, // This enables capturing exceptions using Error Tracking, set to false if you don't want this
  debug: false,
  opt_out_capturing_by_default: true, // Opt-out by default, controlled by cookie consent
});

function updatePosthogConsent(){
  if(typeof(posthog) == "undefined" || !posthog.__loaded) {
    return;
  }
  const optIn = (window.CookieConsent as any)?.acceptedService?.('posthog', 'analytics') || false;
  if (optIn) {
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
  }
  console.log("Updated PostHog consent: ", optIn ? "opted in" : "opted out");
}

window.addEventListener("cc:onConsent", updatePosthogConsent);
window.addEventListener("cc:onChange", updatePosthogConsent);

const container = document.getElementById('root');
if (!container) {
  throw new Error("Root container missing in index.html");
}

const root = ReactDOM.createRoot(container); // Finds the root DOM element
root.render(
  <React.StrictMode>
    <ColorSchemeScript />
    <PostHogProvider
      client={posthog}
    >
      <BrowserRouter basename={BASE_PATH}>
        <App />
      </BrowserRouter>
    </PostHogProvider>
  </React.StrictMode>
);
