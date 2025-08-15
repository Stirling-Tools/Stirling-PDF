import React from 'react';
import { Box, ActionIcon } from '@mantine/core';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export interface NavigationArrowsProps {
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const NavigationArrows: React.FC<NavigationArrowsProps> = ({
  onPrevious,
  onNext,
  disabled = false,
  children
}) => {
  const navigationArrowStyle = {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 10
  };

  return (
    <Box style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Left Navigation Arrow */}
      <ActionIcon
        variant="light"
        size="sm"
        onClick={onPrevious}
        color="blue"
        disabled={disabled}
        style={{
          ...navigationArrowStyle,
          left: '0'
        }}
      >
        <ChevronLeftIcon />
      </ActionIcon>
      
      {/* Content */}
      <Box style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Box>
      
      {/* Right Navigation Arrow */}
      <ActionIcon
        variant="light"
        size="sm"
        onClick={onNext}
        color="blue"
        disabled={disabled}
        style={{
          ...navigationArrowStyle,
          right: '0'
        }}
      >
        <ChevronRightIcon />
      </ActionIcon>
    </Box>
  );
};

export default NavigationArrows;