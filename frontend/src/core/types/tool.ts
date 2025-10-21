import React from 'react';
import { ToolOperationHook } from '@app/hooks/tools/shared/useToolOperation';

export type MaxFiles = number; // 1=single, >1=limited, -1=unlimited
export type ToolCategory = 'manipulation' | 'conversion' | 'analysis' | 'utility' | 'optimization' | 'security';
export type ToolDefinition = Omit<Tool, 'name'>;
export type ToolStepType = 'files' | 'settings' | 'results';

export interface BaseToolProps {
  onComplete?: (results: File[]) => void;
  onError?: (error: string) => void;
  onPreviewFile?: (file: File | null) => void;
}

/**
 * Interface for tool components that support automation.
 * Tools implementing this interface can be used in automation workflows.
 */
export interface AutomationCapableTool {
  /**
   * Static method that returns the operation hook for this tool.
   * This enables automation to execute the tool programmatically.
   */
  tool: () => () => ToolOperationHook<any>;

  /**
   * Static method that returns the default parameters for this tool.
   * This enables automation creation to initialize tools with proper defaults.
   */
  getDefaultParameters: () => any;
}

/**
 * Type for tool components that can be used in automation
 */
export type ToolComponent = React.ComponentType<BaseToolProps> & AutomationCapableTool;

export interface ToolStepConfig {
  type: ToolStepType;
  title: string;
  isVisible: boolean;
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
}

export interface ToolValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface ToolResult {
  success: boolean;
  files?: File[];
  error?: string;
  downloadUrl?: string;
  metadata?: Record<string, any>;
}

export interface ToolConfiguration {
  maxFiles?: number;
  supportedFormats?: string[];
}

export interface Tool {
  id: string;
  name: string;
  title?: string;
  icon: React.ReactNode;
  component: React.ComponentType<BaseToolProps>;
  maxFiles: MaxFiles;
  category?: ToolCategory;
  description?: string;
  endpoints?: string[];
  supportedFormats?: string[];
  validation?: (files: File[]) => ToolValidationResult;
}

export type ToolRegistry = Record<string, Tool>;

