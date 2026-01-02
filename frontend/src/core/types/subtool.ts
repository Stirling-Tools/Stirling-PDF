import type { ReactNode } from 'react';
import { ToolId } from '@app/types/toolId';
import { ToolRegistryEntry } from '@app/data/toolsTaxonomy';

/**
 * Represents a sub-tool entry that extends a parent tool with specific pre-configured options.
 * Example: "Convert from PDF to PNG" is a sub-tool of the main "Convert" tool.
 */
export interface SubToolEntry {
  /** Unique identifier in format "parentId:params", e.g., "convert:pdf-to-png" */
  id: string;

  /** The parent tool this sub-tool belongs to */
  parentId: ToolId;

  /** Display name, e.g., "Convert PDF to PNG" */
  name: string;

  /** Description of what this sub-tool does */
  description: string;

  /** Search terms for matching queries (extensions, labels, synonyms) */
  searchTerms: string[];

  /** Navigation parameters to pre-select options in parent tool */
  navigationParams: Record<string, string>;

  /** Icon to display (typically inherited from parent) */
  icon: ReactNode;

  /** Availability status (true/undefined = available, false = disabled) */
  available?: boolean;
}

/**
 * Type for sub-tool identifiers in format "parentId:params"
 * Example: "convert:pdf-to-png"
 */
export type SubToolId = `${ToolId}:${string}`;

/**
 * Union type for items that can appear in search results
 */
export type SearchableToolId = ToolId | SubToolId;

/**
 * Represents an expanded tool entry that can be either a parent tool or sub-tool
 */
export interface ExpandedToolEntry {
  /** Whether this is a parent tool or sub-tool */
  type: 'parent' | 'subtool';

  /** The tool or sub-tool identifier */
  id: ToolId | string;

  /** The actual tool or sub-tool data */
  entry: ToolRegistryEntry | SubToolEntry;
}

/**
 * Type guard to check if an ID is a sub-tool ID
 */
export function isSubToolId(id: string): id is SubToolId {
  return id.includes(':');
}

/**
 * Parse a sub-tool ID into its parent ID and parameters
 * @param id Sub-tool ID in format "parentId:params"
 * @returns Object with parentId and params string
 * @example parseSubToolId("convert:pdf-to-png") // { parentId: "convert", params: "pdf-to-png" }
 */
export function parseSubToolId(id: SubToolId): { parentId: ToolId; params: string } {
  const [parentId, params] = id.split(':', 2);
  return { parentId: parentId as ToolId, params };
}

/**
 * Type guard to check if an entry is a SubToolEntry
 */
export function isSubToolEntry(entry: ToolRegistryEntry | SubToolEntry): entry is SubToolEntry {
  return 'parentId' in entry && 'navigationParams' in entry;
}
