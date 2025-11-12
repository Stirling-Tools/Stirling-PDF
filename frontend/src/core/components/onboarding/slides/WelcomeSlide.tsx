import React from 'react';
import { SlideConfig } from './types';

export default function WelcomeSlide(): SlideConfig {
  return {
    key: 'welcome',
    title: (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        Welcome to Stirling
        <span
          style={{
            background: '#DBEFFF',
            color: '#2A4BFF',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          V2
        </span>
      </span>
    ),
    body: (
      <span>
        Stirling helps you read and edit PDFs privately. The app includes a simple <strong>Reader</strong> with basic editing tools and an advanced <strong>Editor</strong> with professional editing tools.
      </span>
    ),
    background: {
      gradientStops: ['#7C3AED', '#EC4899'],
      circles: [
        {
          position: 'bottom-left',
          size: 260,
          color: 'rgba(255, 255, 255, 0.25)',
          opacity: 0.9,
          amplitude: 24,
          duration: 11,
          offsetX: 18,
          offsetY: 14,
        },
        {
          position: 'top-right',
          size: 300,
          color: 'rgba(196, 181, 253, 0.4)',
          opacity: 0.9,
          amplitude: 28,
          duration: 12,
          delay: 1.2,
          offsetX: 24,
          offsetY: 18,
        },
      ],
    },
  };
}

