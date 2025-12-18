import { useToast } from '@app/components/toast/ToastContext';
import { ToastInstance, ToastLocation } from '@app/components/toast/types';
import { LocalIcon } from '@app/components/shared/LocalIcon';
import '@app/components/toast/ToastRenderer.css';

const locationToClass: Record<ToastLocation, string> = {
  'top-left': 'toast-container--top-left',
  'top-right': 'toast-container--top-right',
  'bottom-left': 'toast-container--bottom-left',
  'bottom-right': 'toast-container--bottom-right',
  'bottom-center': 'toast-container--bottom-center',
};

function getToastItemClass(t: ToastInstance): string {
  return `toast-item toast-item--${t.alertType}`;
}

function getProgressBarClass(t: ToastInstance): string {
  return `toast-progress-bar toast-progress-bar--${t.alertType}`;
}

function getActionButtonClass(t: ToastInstance): string {
  return `toast-action-button toast-action-button--${t.alertType}`;
}

function getDefaultIconName(t: ToastInstance): string {
  switch (t.alertType) {
    case 'success':
      return 'check-circle-rounded';
    case 'error':
      return 'close-rounded';
    case 'warning':
      return 'warning-rounded';
    case 'neutral':
    default:
      return 'info-rounded';
  }
}

export default function ToastRenderer() {
  const { toasts, dismiss } = useToast();

  const grouped = toasts.reduce<Record<ToastLocation, ToastInstance[]>>((acc, t) => {
    const key = t.location;
    if (!acc[key]) acc[key] = [] as ToastInstance[];
    acc[key].push(t);
    return acc;
  }, { 'top-left': [], 'top-right': [], 'bottom-left': [], 'bottom-right': [], 'bottom-center': [] });

  return (
    <>
      {(Object.keys(grouped) as ToastLocation[]).map((loc) => (
        <div key={loc} className={`toast-container ${locationToClass[loc]}`}>
          {grouped[loc].map(t => {
            return (
              <div
                key={t.id}
                role="status"
                className={getToastItemClass(t)}
              >
                {/* Top row: Icon + Title + Controls */}
                <div className="toast-header">
                  {/* Icon */}
                  <div className="toast-icon">
                    {t.icon ?? (
                      <LocalIcon icon={`material-symbols:${getDefaultIconName(t)}`} width={20} height={20} />
                    )}
                  </div>

                  {/* Title + count badge */}
                  <div className="toast-title-container">
                    <span>{t.title}</span>
                    {typeof t.count === 'number' && t.count > 1 && (
                      <span className="toast-count-badge">{t.count}</span>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="toast-controls">
                    {t.expandable && (
                      <button
                        aria-label="Toggle details"
                        onClick={() => {
                          const evt = new CustomEvent('toast:toggle', { detail: { id: t.id } });
                          window.dispatchEvent(evt);
                        }}
                        className={`toast-button toast-expand-button ${t.isExpanded ? 'toast-expand-button--expanded' : ''}`}
                      >
                        <LocalIcon icon="expand-more-rounded" />
                      </button>
                    )}
                    <button
                      aria-label="Dismiss"
                      onClick={() => dismiss(t.id)}
                      className="toast-button"
                    >
                      <LocalIcon icon="close-rounded" width={20} height={20} />
                    </button>
                  </div>
                </div>
                {/* Progress bar - always show when present */}
                {typeof t.progress === 'number' && (
                  <div className="toast-progress-container">
                    <div
                      className={getProgressBarClass(t)}
                      style={{ width: `${t.progress}%` }}
                    />
                  </div>
                )}

                {/* Body content - only show when expanded */}
                {(t.isExpanded || !t.expandable) && (
                  <div className="toast-body">
                    {t.body}
                  </div>
                )}

                {/* Button - always show when present, positioned below body */}
                {t.buttonText && t.buttonCallback && (
                  <div className="toast-action-container">
                    <button
                      onClick={t.buttonCallback}
                      className={getActionButtonClass(t)}
                    >
                      {t.buttonText}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}


