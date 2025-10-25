// Base parameter interfaces for reusable patterns

// Base interface that all tool parameters should extend
// Provides a foundation for adding common properties across all tools
// Examples of future additions: userId, sessionId, commonFlags, etc.
export type BaseParameters = Record<string, unknown>;

export type ProcessingMode = 'backend' | 'frontend';

export interface ToggleableProcessingParameters {
  processingMode: ProcessingMode;
}
