import React, { createContext, useContext, useMemo, useRef } from 'react';
import { Text, Stack, Box, Flex, Divider } from '@mantine/core';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Tooltip } from '../../shared/Tooltip';
import { TooltipTip } from '../../shared/tooltip/TooltipContent';
import { createFilesToolStep, FilesToolStepProps } from './createFilesToolStep';
import { createResultsToolStep, ResultsToolStepProps } from './createResultsToolStep';

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

  const stepNumber = _stepNumber;

  return (
    <div>
      <div
        style={{
          padding: '1rem',
          opacity: isCollapsed ? 0.8 : 1,
          color: isCollapsed ? 'var(--mantine-color-dimmed)' : 'inherit',
          transition: 'opacity 0.2s ease, color 0.2s ease'
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
        <div>
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
        </div>
      ) : (
        <Stack gap="md" pl="md">
          {helpText && (
            <Text size="sm" c="dimmed">
              {helpText}
            </Text>
          )}
          {children}
        </Stack>
      )}
      </div>
      <Divider style={{ marginLeft: '1rem', marginRight: '-1rem' }} />
    </div>
  );
}

// ToolStepFactory for creating numbered steps
export function createToolSteps() {
  let stepNumber = 1;
  const steps: React.ReactElement[] = [];

  const create = (
    title: string,
    props: Omit<ToolStepProps, 'title' | '_stepNumber'> = {},
    children?: React.ReactNode
  ): React.ReactElement => {
    const isVisible = props.isVisible !== false;
    const currentStepNumber = isVisible ? stepNumber++ : undefined;

    const step = React.createElement(ToolStep, {
      ...props,
      title,
      _stepNumber: currentStepNumber,
      children,
      key: `step-${title.toLowerCase().replace(/\s+/g, '-')}`
    });

    steps.push(step);
    return step;
  };

  const createFilesStep = (props: FilesToolStepProps): React.ReactElement => {
    return createFilesToolStep(create, props);
  };

  const createResultsStep = <TParams = any>(props: ResultsToolStepProps<TParams>): React.ReactElement => {
    return createResultsToolStep(create, props);
  };

  const getVisibleCount = () => {
    return steps.filter(step =>
      (step.props as ToolStepProps).isVisible !== false
    ).length;
  };

  return { create, createFilesStep, createResultsStep, getVisibleCount, steps };
}

// Context provider wrapper for tools using the factory
export function ToolStepProvider({ children }: { children: React.ReactNode }) {
  // Count visible steps from children that are ToolStep elements
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
      {children}
    </ToolStepContext.Provider>
  );
}

export type { FilesToolStepProps } from './createFilesToolStep';
export type { ResultsToolStepProps } from './createResultsToolStep';
export default ToolStep;
