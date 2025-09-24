import React from 'react';
import { useToast } from './ToastContext';
import { ToastInstance, ToastLocation } from './types';
import { LocalIcon } from '../shared/LocalIcon';

const locationToClass: Record<ToastLocation, React.CSSProperties> = {
  'top-left': { top: 16, left: 16, flexDirection: 'column' },
  'top-right': { top: 16, right: 16, flexDirection: 'column' },
  'bottom-left': { bottom: 16, left: 16, flexDirection: 'column-reverse' },
  'bottom-right': { bottom: 16, right: 16, flexDirection: 'column-reverse' },
};

function getColors(t: ToastInstance) {
  switch (t.alertType) {
    case 'success':
      return { bg: 'var(--color-green-100)', border: 'var(--color-green-400)', text: 'var(--text-primary)', bar: 'var(--color-green-500)' };
    case 'error':
      return { bg: 'var(--color-red-100)', border: 'var(--color-red-400)', text: 'var(--text-primary)', bar: 'var(--color-red-500)' };
    case 'warning':
      return { bg: 'var(--color-yellow-100)', border: 'var(--color-yellow-400)', text: 'var(--text-primary)', bar: 'var(--color-yellow-500)' };
    case 'neutral':
    default:
      return { bg: 'var(--bg-surface)', border: 'var(--border-default)', text: 'var(--text-primary)', bar: 'var(--color-gray-500)' };
  }
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
  }, { 'top-left': [], 'top-right': [], 'bottom-left': [], 'bottom-right': [] });

  return (
    <>
      {(Object.keys(grouped) as ToastLocation[]).map((loc) => (
        <div key={loc} style={{ position: 'fixed', zIndex: 1200, display: 'flex', gap: 12, pointerEvents: 'none', ...locationToClass[loc] }}>
          {grouped[loc].map(t => {
            const colors = getColors(t);
            return (
              <div
                key={t.id}
                role="status"
                style={{
                  minWidth: 320,
                  maxWidth: 560,
                  background: t.alertType === 'neutral' ? 'var(--bg-surface)' : colors.bg,
                  color: colors.text,
                  border: `1px solid ${t.alertType === 'neutral' ? 'var(--border-default)' : colors.border}`,
                  boxShadow: 'var(--shadow-lg)',
                  borderRadius: 16,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  pointerEvents: 'auto',
                }}
              >
                {/* Top row: Icon + Title + Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Icon */}
                  <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {t.icon ?? (
                      <LocalIcon icon={`material-symbols:${getDefaultIconName(t)}`} width={20} height={20} style={{ color: colors.bar }} />
                    )}
                  </div>
                  
                  {/* Title */}
                  <div style={{ fontWeight: 700, flex: 1 }}>{t.title}</div>
                  
                  {/* Controls */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {t.expandable && (
                      <button
                        aria-label="Toggle details"
                        onClick={() => {
                          const evt = new CustomEvent('toast:toggle', { detail: { id: t.id } });
                          window.dispatchEvent(evt);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transform: t.isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 160ms ease',
                        }}
                      >
                        <LocalIcon icon="material-symbols:expand-more-rounded" />
                      </button>
                    )}
                    <button
                      aria-label="Dismiss"
                      onClick={() => dismiss(t.id)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <LocalIcon icon="material-symbols:close-rounded" width={20} height={20} />
                    </button>
                  </div>
                </div>
                {(t.isExpanded || !t.expandable) && (
                  <div
                    style={{
                      fontSize: 14,
                      opacity: 0.9,
                      marginTop: 8,
                    }}
                  >
                  {t.body}
                  {t.buttonText && t.buttonCallback && (
                    <button
                      onClick={t.buttonCallback}
                      style={{
                        marginTop: 12,
                        padding: '8px 12px',
                        borderRadius: 12,
                        border: `1px solid ${colors.border}`,
                        background: 'transparent',
                        color: colors.text,
                        fontWeight: 600,
                      }}
                    >
                      {t.buttonText}
                    </button>
                  )}
                  {typeof t.progress === 'number' && (
                    <div style={{ marginTop: 12, height: 6, background: 'var(--bg-muted)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${t.progress}%`, height: '100%', background: colors.bar, transition: 'width 160ms ease' }} />
                    </div>
                  )}
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


