import React from 'react';

interface WarningProps {
  text: React.ReactNode;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

const Warning: React.FC<WarningProps> = ({ text, width = '100%', height, className, style }) => {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'var(--warning-yellow-bg)',
        border: '1px solid var(--warning-yellow-border)',
        borderRadius: 12,
        padding: '12px 16px',
        color: '#7c4a03',
        ...style,
      }}
    >
      <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
      <div style={{ flex: 1 }}>{text}</div>
    </div>
  );
};

export default Warning;


