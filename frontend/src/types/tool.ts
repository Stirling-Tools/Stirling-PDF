import React from 'react';

// Type definitions for better type safety
export type MaxFiles = number; // 1 = single file, >1 = limited multi-file, -1 = unlimited
export type ToolCategory = 'manipulation' | 'conversion' | 'analysis' | 'utility' | 'optimization' | 'security';

/**
 * Tool definition without name - used for base definitions before translation
 */
export type ToolDefinition = Omit<Tool, 'name'>;

/**
 * Standard interface that all modern tools should implement
 * This ensures consistent behavior and makes adding new tools trivial
 */
export interface BaseToolProps {
  // Tool results callback - called when tool completes successfully
  onComplete?: (results: File[]) => void;
  
  // Error handling callback
  onError?: (error: string) => void;
  
  // Preview functionality for result files
  onPreviewFile?: (file: File | null) => void;
}

/**
 * Tool step types for standardized UI
 */
export type ToolStepType = 'files' | 'settings' | 'results';

/**
 * Tool step configuration
 */
export interface ToolStepConfig {
  type: ToolStepType;
  title: string;
  isVisible: boolean;
  isCompleted: boolean;
  isCollapsed?: boolean;
  completedMessage?: string;
  onCollapsedClick?: () => void;
}

/**
 * Tool operation result
 */
export interface ToolResult {
  success: boolean;
  files?: File[];
  error?: string;
  downloadUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Complete tool definition - single interface for all tool needs
 */
export interface Tool {
  id: string;
  name: string;                                    // Always required - added via translation
  icon: React.ReactNode;                          // Always required - for UI display
  component: React.ComponentType<BaseToolProps>;  // Lazy-loaded tool component
  maxFiles: MaxFiles;                             // File selection limit: 1=single, 5=limited, -1=unlimited
  category?: ToolCategory;                        // Tool grouping for organization
  description?: string;                           // Help text for users
  endpoints?: string[];                           // Backend endpoints this tool uses
  supportedFormats?: string[];                    // File types this tool accepts
  validation?: (files: File[]) => { valid: boolean; message?: string }; // File validation logic
}

/**
 * Tool registry type - tools indexed by key
 */
export type ToolRegistry = Record<string, Tool>;

/**
 * File selection context interfaces for type safety
 */
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