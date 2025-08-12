import React, { createContext, useContext, useMemo, useRef } from 'react';
import { Paper, Text, Stack, Box, Flex } from '@mantine/core';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Tooltip } from '../../shared/Tooltip';
import { TooltipTip } from '../../shared/tooltip/TooltipContent';

interface ToolStepContextType {
  visibleStepCount: number;
}

const ToolStepContext = createContext<ToolStepContextType | null>(null);

export interface ToolStepProps {
  title: string;
  isVisible?: boolean;
  isCollapsed?: boolean;
  isCompleted?: boolean;
  onCollapsedClick?: () => void;
  children?: React.ReactNode;
  completedMessage?: string;
  helpText?: string;
  showNumber?: boolean;
  _stepNumber?: number; // Internal prop set by ToolStepContainer
  tooltip?: {
    content?: React.ReactNode;
    tips?: TooltipTip[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };
}

const renderTooltipTitle = (
  title: string,
  tooltip: ToolStepProps['tooltip'],
  isCollapsed: boolean
) => {
  if (tooltip && !isCollapsed) {
    return (
      <Tooltip
        content={tooltip.content}
        tips={tooltip.tips}
        header={tooltip.header}
        sidebarTooltip={true}
      >
        <Flex align="center" gap="xs" onClick={(e) => e.stopPropagation()}>
          <Text fw={500} size="lg">
            {title}
          </Text>
          <span className="material-symbols-rounded" style={{ fontSize: '1.2rem', color: 'var(--icon-files-color)' }}>
            gpp_maybe
          </span>
        </Flex>
      </Tooltip>
    );
  }
  
  return (
    <Text fw={500} size="lg">
      {title}
    </Text>
  );
};

const ToolStep = ({
  title,
  isVisible = true,
  isCollapsed = false,
  isCompleted = false,
  onCollapsedClick,
  children,
  completedMessage,
  helpText,
  showNumber,
  _stepNumber,
  tooltip
}: ToolStepProps) => {
  if (!isVisible) return null;

  const parent = useContext(ToolStepContext);
  
  // Auto-detect if we should show numbers based on sibling count
  const shouldShowNumber = useMemo(() => {
    if (showNumber !== undefined) return showNumber;
    return parent ? parent.visibleStepCount >= 3 : false;
  }, [showNumber, parent]);

  const stepNumber = _stepNumber || 1;

  return (
    <Paper
      p="md"
      withBorder
      style={{
        opacity: isCollapsed ? 0.8 : 1,
        transition: 'opacity 0.2s ease'
      }}
    >
      {/* Chevron icon to collapse/expand the step */}
      <Flex 
        align="center" 
        justify="space-between" 
        mb="sm"
        style={{
          cursor: onCollapsedClick ? 'pointer' : 'default'
        }}
        onClick={onCollapsedClick}
      >
        <Flex align="center" gap="sm">
          {shouldShowNumber && (
            <Text fw={500} size="lg" c="dimmed">
              {stepNumber}
            </Text>
          )}
          {renderTooltipTitle(title, tooltip, isCollapsed)}
        </Flex>
        
        {isCollapsed ? (
          <ChevronRightIcon style={{ 
            fontSize: '1.2rem', 
            color: 'var(--mantine-color-dimmed)',
            opacity: onCollapsedClick ? 1 : 0.5
          }} />
        ) : (
          <ExpandMoreIcon style={{ 
            fontSize: '1.2rem', 
            color: 'var(--mantine-color-dimmed)',
            opacity: onCollapsedClick ? 1 : 0.5
          }} />
        )}
      </Flex>

      {isCollapsed ? (
        <Box>
          {isCompleted && completedMessage && (
            <Text size="sm" c="green">
              ✓ {completedMessage}
              {onCollapsedClick && (
                <Text span c="dimmed" size="xs" ml="sm">
                  (click to change)
                </Text>
              )}
            </Text>
          )}
        </Box>
      ) : (
        <Stack gap="md">
          {helpText && (
            <Text size="sm" c="dimmed">
              {helpText}
            </Text>
          )}
          {children}
        </Stack>
      )}
    </Paper>
  );
}

export interface ToolStepContainerProps {
  children: React.ReactNode;
}

export const ToolStepContainer = ({ children }: ToolStepContainerProps) => {
  // Process children and inject step numbers for visible ToolSteps
  const processedChildren = useMemo(() => {
    let visibleStepNumber = 1;
    
    return React.Children.map(children, (child) => {
      if (React.isValidElement(child) && child.type === ToolStep) {
        const isVisible = (child.props as ToolStepProps).isVisible !== false;
        if (isVisible) {
          return React.cloneElement(child, {
            ...child.props,
            _stepNumber: visibleStepNumber++
          } as ToolStepProps);
        }
      }
      return child;
    });
  }, [children]);

  const visibleStepCount = useMemo(() => {
    let count = 0;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === ToolStep) {
        const isVisible = (child.props as ToolStepProps).isVisible !== false;
        if (isVisible) count++;
      }
    });
    return count;
  }, [children]);

  const contextValue = useMemo(() => ({
    visibleStepCount
  }), [visibleStepCount]);

  return (
    <ToolStepContext.Provider value={contextValue}>
      {processedChildren}
    </ToolStepContext.Provider>
  );
}

export default ToolStep;
