import React from 'react';

export type MaxFiles = number; // 1=single, >1=limited, -1=unlimited
export type ToolCategory = 'manipulation' | 'conversion' | 'analysis' | 'utility' | 'optimization' | 'security';
export type ToolDefinition = Omit<Tool, 'name'>;
export type ToolStepType = 'files' | 'settings' | 'results';

export interface BaseToolProps {
  onComplete?: (results: File[]) => void;
  onError?: (error: string) => void;
  onPreviewFile?: (file: File | null) => void;
}

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

