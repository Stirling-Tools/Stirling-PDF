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
  isCompleted: boolean;
  isCollapsed?: boolean;
  completedMessage?: string;
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

export interface Tool {
  id: string;
  name: string;
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

export interface FileSelectionState {
  selectedFiles: File[];
  maxFiles: MaxFiles;
  isToolMode: boolean;
}

export interface FileSelectionActions {
  setSelectedFiles: (files: File[]) => void;
  setMaxFiles: (maxFiles: MaxFiles) => void;
  setIsToolMode: (isToolMode: boolean) => void;
  clearSelection: () => void;
}

export interface FileSelectionComputed {
  canSelectMore: boolean;
  isAtLimit: boolean;
  selectionCount: number;
  isMultiFileMode: boolean;
}

export interface FileSelectionContextValue extends FileSelectionState, FileSelectionActions, FileSelectionComputed {}