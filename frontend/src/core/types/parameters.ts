// Base parameter interfaces for reusable patterns

/**
 * Base interface that all tool parameters should extend.
 * Provides a foundation for adding common properties across all tools
 * (e.g., userId, sessionId, common flags).
 */
export type BaseParameters = object;

/**
 * Generic handler for updating individual parameter values.
 */
export type ParameterUpdater<T extends object> = <K extends keyof T>(
  parameter: K,
  value: T[K]
) => void;
