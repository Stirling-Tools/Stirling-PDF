import React from 'react';
import { Box } from '@mantine/core';
import VisibilityIcon from '@mui/icons-material/Visibility';

export interface HoverOverlayProps {
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

const HoverOverlay: React.FC<HoverOverlayProps> = ({
  onMouseEnter,
  onMouseLeave,
  children
}) => {
  const defaultMouseEnter = (e: React.MouseEvent) => {
    const overlay = e.currentTarget.querySelector('.hover-overlay') as HTMLElement;
    if (overlay) overlay.style.opacity = '1';
  };

  const defaultMouseLeave = (e: React.MouseEvent) => {
    const overlay = e.currentTarget.querySelector('.hover-overlay') as HTMLElement;
    if (overlay) overlay.style.opacity = '0';
  };

  return (
    <Box
      style={{
        position: 'relative',
        width: '100%',
        height: '100%'
      }}
      onMouseEnter={onMouseEnter || defaultMouseEnter}
      onMouseLeave={onMouseLeave || defaultMouseLeave}
    >
      {children}
      
      {/* Hover overlay */}
      <Box
        className="hover-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          borderRadius: '0.25rem',
          opacity: 0,
          transition: 'opacity 0.2s ease',
          pointerEvents: 'none'
        }}
      >
        <VisibilityIcon style={{ color: 'white', fontSize: '1.5rem' }} />
      </Box>
    </Box>
  );
};

export default HoverOverlay;