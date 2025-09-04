import React from 'react';
import { TFunction } from 'i18next';
import { BaseParametersHook } from '../../../hooks/tools/shared/useBaseParameters';
import { ToolOperationHook } from '../../../hooks/tools/shared/useToolOperation';
import { BaseToolProps } from '../../../types/tool';
import { TooltipTip } from '../../../types/tips';

/**
 * Configuration for a single tool step/section
 */
export interface ToolStepDefinition<TParams> {
  /** Unique identifier for this step */
  key: string;

  /** Display title for the step */
  title: (t: TFunction) => string;

  /** Settings component to render in this step */
  component: React.ComponentType<{
    parameters: TParams;
    onParameterChange: (key: keyof TParams, value: TParams[keyof TParams]) => void;
    disabled?: boolean;
  }>;

  /** Tooltip configuration for this step */
  tooltip?: (t: TFunction) => {
    content?: React.ReactNode;
    tips?: TooltipTip[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };

  /** Whether this step is visible (defaults to true) */
  isVisible?: boolean | ((params: TParams, hasFiles: boolean, hasResults: boolean) => boolean);
}

/**
 * Configuration for the execute button
 */
export interface ToolExecuteButtonDefinition {
  /** Button text */
  text: (t: TFunction) => string;

  /** Loading state text */
  loadingText?: (t: TFunction) => string;

  /** Test ID for the button */
  testId?: string;
}

/**
 * Configuration for the review/results section
 */
export interface ToolReviewDefinition {
  /** Title for the review section */
  title: (t: TFunction) => string;

  /** Test ID for the review section */
  testId?: string;
}

/**
 * Complete tool definition for declarative tool creation
 */
export interface ToolDefinition<TParams> {
  /** Unique tool identifier */
  id: string;

  /** Hook that provides parameter management */
  useParameters: () => BaseParametersHook<TParams>;

  /** Hook that provides operation execution */
  useOperation: () => ToolOperationHook<TParams>;

  /** Configuration steps for the tool */
  steps: ToolStepDefinition<TParams>[];

  /** Execute button configuration */
  executeButton: ToolExecuteButtonDefinition;

  /** Review section configuration */
  review: ToolReviewDefinition;

  /** Optional tooltip for when using this tool */
  tooltip?: (t: TFunction) => {
    content?: React.ReactNode;
    tips?: TooltipTip[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };
}

/**
 * Props for GenericTool component
 */
export interface GenericToolProps<TParams> extends BaseToolProps {
  /** Tool definition to render */
  definition: ToolDefinition<TParams>;
}

/**
 * Registry entry for a tool
 */
export interface ToolRegistryEntry<TParams> {
  /** Tool definition */
  definition: ToolDefinition<TParams>;

  /** Display metadata */
  metadata: {
    name: string;
    category: string;
    description?: string;
    icon?: React.ReactNode;
  };
}
