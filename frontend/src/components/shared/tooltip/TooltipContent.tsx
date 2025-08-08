import React from 'react';
import styles from './Tooltip.module.css';

export interface TooltipTip {
  title?: string;
  description?: string;
  bullets?: string[];
  body?: React.ReactNode;
}

interface TooltipContentProps {
  content?: React.ReactNode;
  tips?: TooltipTip[];
}

export const TooltipContent: React.FC<TooltipContentProps> = ({
  content,
  tips,
}) => {
  return (
    <div
      className={`${styles['tooltip-body']}`}
      style={{
        color: 'var(--text-primary)',
        padding: '16px',
        fontSize: '14px',
        lineHeight: '1.6'
      }}
    >
      <div style={{ color: 'var(--text-primary)' }}>
        {tips ? (
          <>
            {tips.map((tip, index) => (
              <div key={index} style={{ marginBottom: index < tips.length - 1 ? '24px' : '0' }}>
                {tip.title && (
                  <div style={{
                    display: 'inline-block',
                    backgroundColor: 'var(--tooltip-title-bg)',
                    color: 'var(--tooltip-title-color)',
                    padding: '6px 12px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: '600',
                    marginBottom: '12px'
                  }}>
                    {tip.title}
                  </div>
                )}
                {tip.description && (
                  <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '13px' }} dangerouslySetInnerHTML={{ __html: tip.description }} />
                )}
                {tip.bullets && tip.bullets.length > 0 && (
                  <ul style={{ margin: '0', paddingLeft: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {tip.bullets.map((bullet, bulletIndex) => (
                      <li key={bulletIndex} style={{ marginBottom: '6px' }} dangerouslySetInnerHTML={{ __html: bullet }} />
                    ))}
                  </ul>
                )}
                {tip.body && (
                  <div style={{ marginTop: '12px' }}>
                    {tip.body}
                  </div>
                )}
              </div>
            ))}
            {content && (
              <div style={{ marginTop: '24px' }}>
                {content}
              </div>
            )}
          </>
        ) : (
          content
        )}
      </div>
    </div>
  );
}; 