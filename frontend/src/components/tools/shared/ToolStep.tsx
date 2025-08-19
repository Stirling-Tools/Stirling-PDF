import React, { createContext, useContext, useMemo, useRef } from 'react';
import { Text, Stack, Box, Flex, Divider } from '@mantine/core';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Tooltip } from '../../shared/Tooltip';
import { TooltipTip } from '../../../types/tips';
import { createFilesToolStep, FilesToolStepProps } from './FilesToolStep';
import { createReviewToolStep, ReviewToolStepProps } from './ReviewToolStep';

interface ToolStepContextType {
  visibleStepCount: number;
  forceStepNumbers?: boolean;
}

const ToolStepContext = createContext<ToolStepContextType | null>(null);

export interface ToolStepProps {
  title: string;
  isVisible?: boolean;
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
  children?: React.ReactNode;
  helpText?: string;
  showNumber?: boolean;
  _stepNumber?: number; // Internal prop set by ToolStepContainer
  _excludeFromCount?: boolean; // Internal prop to exclude from visible count calculation
  _noPadding?: boolean; // Internal prop to exclude from default left padding
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
  onCollapsedClick,
  children,
  helpText,
  showNumber,
  _stepNumber,
  _noPadding,
  tooltip
}: ToolStepProps) => {
  if (!isVisible) return null;

  const parent = useContext(ToolStepContext);

  // Auto-detect if we should show numbers based on sibling count or force option
  const shouldShowNumber = useMemo(() => {
    if (showNumber !== undefined) return showNumber; // Individual step override
    if (parent?.forceStepNumbers) return true; // Flow-level force
    return parent ? parent.visibleStepCount >= 3 : false; // Auto-detect
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

      {!isCollapsed && (
        <Stack gap="md" pl={_noPadding ? 0 : "md"}>
          {helpText && (
            <Text size="sm" c="dimmed">
              {helpText}
            </Text>
          )}
          {children}
        </Stack>
      )}
      </div>
      <Divider style={{ marginLeft: '1rem', marginRight: '-0.5rem' }} />
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

  const createReviewStep = <TParams = unknown>(props: ReviewToolStepProps<TParams>): React.ReactElement => {
    return createReviewToolStep(create, props);
  };

  const getVisibleCount = () => {
    return steps.filter(step => {
      const props = step.props as ToolStepProps;
      const isVisible = props.isVisible !== false;
      const excludeFromCount = props._excludeFromCount === true;
      return isVisible && !excludeFromCount;
    }).length;
  };

  return { create, createFilesStep, createReviewStep, getVisibleCount, steps };
}

// Context provider wrapper for tools using the factory
export function ToolStepProvider({ children, forceStepNumbers }: { children: React.ReactNode; forceStepNumbers?: boolean }) {
  // Count visible steps from children that are ToolStep elements
  const visibleStepCount = useMemo(() => {
    let count = 0;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === ToolStep) {
        const props = child.props as ToolStepProps;
        const isVisible = props.isVisible !== false;
        const excludeFromCount = props._excludeFromCount === true;
        if (isVisible && !excludeFromCount) count++;
      }
    });
    return count;
  }, [children]);

  const contextValue = useMemo(() => ({
    visibleStepCount,
    forceStepNumbers
  }), [visibleStepCount, forceStepNumbers]);

  return (
    <ToolStepContext.Provider value={contextValue}>
      {children}
    </ToolStepContext.Provider>
  );
}

export type { FilesToolStepProps } from './FilesToolStep';
export type { ReviewToolStepProps } from './ReviewToolStep';
export default ToolStep;
