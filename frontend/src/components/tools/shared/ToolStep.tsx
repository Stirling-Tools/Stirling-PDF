import React, { createContext, useContext, useMemo, useRef } from 'react';
import { Paper, Text, Stack, Box } from '@mantine/core';

interface ToolStepContextType {
  visibleStepCount: number;
  getStepNumber: () => number;
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
}

const ToolStep = ({
  title,
  isVisible = true,
  isCollapsed = false,
  isCompleted = false,
  onCollapsedClick,
  children,
  completedMessage,
  helpText,
  showNumber
}: ToolStepProps) => {
  if (!isVisible) return null;

  // Auto-detect if we should show numbers based on sibling count
  const shouldShowNumber = useMemo(() => {
    if (showNumber !== undefined) return showNumber;
    const parent = useContext(ToolStepContext);
    return parent ? parent.visibleStepCount >= 3 : false;
  }, [showNumber]);

  const stepNumber = useContext(ToolStepContext)?.getStepNumber?.() || 1;

  return (
    <Paper
      p="md"
      withBorder
      style={{
        cursor: isCollapsed && onCollapsedClick ? 'pointer' : 'default',
        opacity: isCollapsed ? 0.8 : 1,
        transition: 'opacity 0.2s ease'
      }}
      onClick={isCollapsed && onCollapsedClick ? onCollapsedClick : undefined}
    >
      <Text fw={500} size="lg" mb="sm">
        {shouldShowNumber ? `${stepNumber}. ` : ''}{title}
      </Text>

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
  const stepCounterRef = useRef(0);

  // Count visible ToolStep children
  const visibleStepCount = useMemo(() => {
    let count = 0;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === ToolStep) {
        const isVisible = child.props.isVisible !== false;
        if (isVisible) count++;
      }
    });
    return count;
  }, [children]);

  const contextValue = useMemo(() => ({
    visibleStepCount,
    getStepNumber: () => ++stepCounterRef.current
  }), [visibleStepCount]);

  stepCounterRef.current = 0;

  return (
    <ToolStepContext.Provider value={contextValue}>
      {children}
    </ToolStepContext.Provider>
  );
}

export default ToolStep;
