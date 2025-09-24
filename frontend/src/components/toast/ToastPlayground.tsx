import React from 'react';
import { alert, updateToastProgress, updateToast, dismissToast, dismissAllToasts } from './index';

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function ToastPlayground() {
  const runProgress = async () => {
    const id = alert({
      alertType: 'neutral',
      title: 'Downloading…',
      body: 'Fetching data from server',
      progressBarPercentage: 0,
      isPersistentPopup: true,
      location: 'bottom-right',
    });
    for (let p = 0; p <= 100; p += 10) {
      updateToastProgress(id, p);
      // eslint-disable-next-line no-await-in-loop
      await wait(250);
    }
    updateToast(id, { title: 'Download complete', body: 'File saved', isPersistentPopup: false, alertType: 'success' });
    setTimeout(() => dismissToast(id), 2000);
  };

  const withButtons = () => {
    alert({
      alertType: 'warning',
      title: 'Replace existing file?',
      body: 'A file with the same name already exists.',
      buttonText: 'Replace',
      buttonCallback: () => alert({ alertType: 'success', title: 'Replaced', body: 'Your file has been replaced.' }),
      isPersistentPopup: true,
      location: 'top-right',
    });
  };

  const withCustomIcon = () => {
    alert({
      alertType: 'neutral',
      title: 'Custom icon',
      body: 'This toast shows a custom SVG icon.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M10 5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="14.5" r="1" fill="currentColor" />
        </svg>
      ),
      isPersistentPopup: false,
      location: 'top-left',
    });
  };

  const differentLocations = () => {
    (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).forEach((loc) => {
      alert({ alertType: 'neutral', title: `Toast @ ${loc}`, body: 'Location test', location: loc });
    });
  };

  const success = () => alert({ alertType: 'success', title: 'Success', body: 'Operation completed.' });
  const error = () => alert({ alertType: 'error', title: 'Error', body: 'Something went wrong.' });
  const warning = () => alert({ alertType: 'warning', title: 'Warning', body: 'Please check your inputs.' });
  const neutral = () => alert({ alertType: 'neutral', title: 'Information', body: 'Heads up!' });

  const persistent = () => alert({ alertType: 'neutral', title: 'Persistent toast', body: 'Click × to close.', isPersistentPopup: true });

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1150,
        background: 'linear-gradient(to top, rgba(0,0,0,0.08), transparent)',
        padding: '12px 8px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          padding: '8px',
          borderRadius: 12,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <Button onClick={success}>Success</Button>
        <Button onClick={error}>Error</Button>
        <Button onClick={warning}>Warning</Button>
        <Button onClick={neutral}>Neutral</Button>
        <Divider />
        <Button onClick={withButtons}>With button</Button>
        <Button onClick={withCustomIcon}>Custom icon</Button>
        <Button onClick={differentLocations}>All locations</Button>
        <Button onClick={runProgress}>Progress demo</Button>
        <Button onClick={persistent}>Persistent</Button>
        <Divider />
        <Button onClick={() => dismissAllToasts()}>Dismiss all</Button>
      </div>
    </div>
  );
}

function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        whiteSpace: 'nowrap',
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, background: 'var(--border-default)' }} />;
}


