import React, { createContext, useContext, useMemo } from 'react';
import { Text, Stack, Flex, Divider } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { TooltipTip } from '@app/types/tips';
import { createFilesToolStep, FilesToolStepProps } from '@app/components/tools/shared/FilesToolStep';
import { createReviewToolStep, ReviewToolStepProps } from '@app/components/tools/shared/ReviewToolStep';

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
  alwaysShowTooltip?: boolean; // Force tooltip to show even when collapsed
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
  isCollapsed: boolean,
  alwaysShowTooltip: boolean = false
) => {
  if (tooltip && (!isCollapsed || alwaysShowTooltip)) {
    return (
      <Tooltip
        content={tooltip.content}
        tips={tooltip.tips}
        header={tooltip.header}
        sidebarTooltip={true}
        pinOnClick={true}
      >
        <Flex align="center" gap="xs" onClick={(e) => e.stopPropagation()}>
          <Text fw={400} size="sm">
            {title}
          </Text>
          <LocalIcon icon="info-outline-rounded" width="1.25rem" height="1.25rem" style={{ color: 'var(--icon-files-color)' }} />
        </Flex>
      </Tooltip>
    );
  }

  return (
    <Text fw={500} size="sm">
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
  alwaysShowTooltip = false,
  tooltip
}: ToolStepProps) => {
  const parent = useContext(ToolStepContext);

  // Auto-detect if we should show numbers based on sibling count or force option
  const shouldShowNumber = useMemo(() => {
    if (showNumber !== undefined) return showNumber; // Individual step override
    if (parent?.forceStepNumbers) return true; // Flow-level force
    return parent ? parent.visibleStepCount >= 3 : false; // Auto-detect
  }, [showNumber, parent]);

  if (!isVisible) return null;

  const stepNumber = _stepNumber;

  return (
    <div>
      <div
        style={{
          padding: '0.5rem',
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
            <Text fw={500} size="sm" c="dimmed" mr="0.5rem">
              {stepNumber}
            </Text>
          )}
          {renderTooltipTitle(title, tooltip, isCollapsed, alwaysShowTooltip)}
        </Flex>

        {isCollapsed ? (
          <LocalIcon icon="chevron-right-rounded" width="1.2rem" height="1.2rem" style={{
            color: 'var(--mantine-color-dimmed)',
            opacity: onCollapsedClick ? 1 : 0.5
          }} />
        ) : (
          <LocalIcon icon="expand-more-rounded" width="1.2rem" height="1.2rem" style={{
            color: 'var(--mantine-color-dimmed)',
            opacity: onCollapsedClick ? 1 : 0.5
          }} />
        )}
      </Flex>

      {!isCollapsed && (
        <Stack gap="sm" pl={_noPadding ? 0 : "sm"}>
          {helpText && (
            <Text size="sm" c="dimmed">
              {helpText}
            </Text>
          )}
          {children}
        </Stack>
      )}
      </div>
      <Divider style={{ color: '#E2E8F0', marginLeft: '1rem', marginRight: '-0.5rem' }} />
    </div>
  );
};

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

    const step = React.createElement(
      ToolStep,
      {
        ...props,
        title,
        _stepNumber: currentStepNumber,
        key: `step-${title.toLowerCase().replace(/\s+/g, '-')}`
      },
      children
    );

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
      const stepProps = step.props as ToolStepProps;
      const isVisible = stepProps.isVisible !== false;
      const excludeFromCount = stepProps._excludeFromCount === true;
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
        const stepProps = child.props as ToolStepProps;
        const isVisible = stepProps.isVisible !== false;
        const excludeFromCount = stepProps._excludeFromCount === true;
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

export type { FilesToolStepProps } from '@app/components/tools/shared/FilesToolStep';
export type { ReviewToolStepProps } from '@app/components/tools/shared/ReviewToolStep';
export default ToolStep;
