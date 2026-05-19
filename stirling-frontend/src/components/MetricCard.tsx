import type { ReactNode } from 'react';
import './MetricCard.css';

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface MetricCardProps {
  label: string;
  value: string | number;
  /** Optional description shown under the delta line. */
  description?: string;
  /** Numeric delta as a fraction (0.12 = +12%). The sign drives direction unless `deltaDirection` is set. */
  delta?: number;
  /** Override the inferred direction — useful when you only want the colour, not the value. */
  deltaDirection?: DeltaDirection;
  /** Visual emphasis. `primary` = darker surface, used for hero metrics. */
  emphasis?: 'default' | 'primary';
  /** Optional icon shown in the top-right corner. */
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
}

function inferDirection(delta?: number): DeltaDirection {
  if (delta === undefined || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function formatDelta(delta: number) {
  const pct = Math.round(Math.abs(delta) * 100);
  return `${pct}%`;
}

/**
 * Stirling's standard KPI card. Used on Home, Sources, Documents, Audit and
 * every Infrastructure tab — the prototype calls these the metric strip.
 */
export function MetricCard({
  label,
  value,
  description,
  delta,
  deltaDirection,
  emphasis = 'default',
  icon,
  onClick,
  className,
}: MetricCardProps) {
  const dir = deltaDirection ?? inferDirection(delta);
  const interactive = !!onClick;
  return (
    <div
      className={[
        'sui-metric',
        emphasis === 'primary' ? 'sui-metric--primary' : '',
        interactive ? 'sui-metric--interactive' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick!(); } : undefined}
    >
      <div className="sui-metric__header">
        <span className="sui-metric__label">{label}</span>
        {icon && <span className="sui-metric__icon" aria-hidden>{icon}</span>}
      </div>
      <div className="sui-metric__value">{value}</div>
      {(delta !== undefined || description) && (
        <div className="sui-metric__footer">
          {delta !== undefined && (
            <span className={`sui-metric__delta sui-metric__delta--${dir}`}>
              <span className="sui-metric__delta-arrow" aria-hidden>
                {dir === 'up' ? '↑' : dir === 'down' ? '↓' : '·'}
              </span>
              {formatDelta(delta)}
            </span>
          )}
          {description && <span className="sui-metric__desc">{description}</span>}
        </div>
      )}
    </div>
  );
}
