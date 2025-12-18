import { type TFunction } from 'i18next';
import React from 'react';
import { ToolOperationConfig } from '@app/hooks/tools/shared/useToolOperation';
import { BaseToolProps } from '@app/types/tool';
import { WorkbenchType } from '@app/types/workbench';
import { LinkToolId, RegularToolId, SuperToolId, ToolId, ToolKind } from '@app/types/toolId';
import { ProprietaryToolId } from '@app/types/proprietaryToolId';
import LocalIcon from '@app/components/shared/LocalIcon';

export enum SubcategoryId {
  SIGNING = 'signing',
  DOCUMENT_SECURITY = 'documentSecurity',
  VERIFICATION = 'verification',
  DOCUMENT_REVIEW = 'documentReview',
  PAGE_FORMATTING = 'pageFormatting',
  EXTRACTION = 'extraction',
  REMOVAL = 'removal',
  AUTOMATION = 'automation',
  GENERAL = 'general',
  ADVANCED_FORMATTING = 'advancedFormatting',
  DEVELOPER_TOOLS = 'developerTools'
}

export enum ToolCategoryId {
  STANDARD_TOOLS = 'standardTools',
  ADVANCED_TOOLS = 'advancedTools',
  RECOMMENDED_TOOLS = 'recommendedTools'
}

export type ToolRegistryEntry = {
	icon: React.ReactNode;
	name: string;
	component: React.ComponentType<BaseToolProps> | null;
	description: string;
	categoryId: ToolCategoryId;
	subcategoryId: SubcategoryId;
	maxFiles?: number;
	supportedFormats?: string[];
	endpoints?: string[];
	link?: string;
	kind?: ToolKind;
	// Workbench type for navigation
	workbench?: WorkbenchType;
	// Operation configuration for automation
	operationConfig?: ToolOperationConfig<any>;
	// Settings component for automation configuration
	automationSettings: React.ComponentType<any> | null;
	// Whether this tool supports automation (defaults to true)
	supportsAutomate?: boolean;
	// Synonyms for search (optional)
	synonyms?: string[];
	// Version status indicator (e.g., "alpha", "beta")
	versionStatus?: "alpha" | "beta";
	// Whether this tool requires premium access
	requiresPremium?: boolean;
}

export type RegularToolRegistry = Record<RegularToolId, ToolRegistryEntry>;
export type SuperToolRegistry = Record<SuperToolId, ToolRegistryEntry>;
export type LinkToolRegistry = Record<LinkToolId, ToolRegistryEntry>;
export type ToolRegistry = Record<ToolId, ToolRegistryEntry>;
export type ProprietaryToolRegistry = Record<ProprietaryToolId, ToolRegistryEntry>;

export const SUBCATEGORY_ORDER: SubcategoryId[] = [
  SubcategoryId.SIGNING,
  SubcategoryId.DOCUMENT_SECURITY,
  SubcategoryId.VERIFICATION,
  SubcategoryId.DOCUMENT_REVIEW,
  SubcategoryId.PAGE_FORMATTING,
  SubcategoryId.EXTRACTION,
  SubcategoryId.REMOVAL,
  SubcategoryId.AUTOMATION,
  SubcategoryId.GENERAL,
  SubcategoryId.ADVANCED_FORMATTING,
  SubcategoryId.DEVELOPER_TOOLS,
];

export const SUBCATEGORY_COLOR_MAP: Record<SubcategoryId, string> = {
  [SubcategoryId.SIGNING]: 'var(--category-color-signing)',           // Green
  [SubcategoryId.DOCUMENT_SECURITY]: 'var(--category-color-security)', // Orange
  [SubcategoryId.VERIFICATION]: 'var(--category-color-verification)',      // Orange
  [SubcategoryId.DOCUMENT_REVIEW]: 'var(--category-color-general)',   // Blue
  [SubcategoryId.PAGE_FORMATTING]: 'var(--category-color-formatting)',   // Purple
  [SubcategoryId.EXTRACTION]: 'var(--category-color-extraction)',        // Cyan
  [SubcategoryId.REMOVAL]: 'var(--category-color-removal)',           // Red
  [SubcategoryId.AUTOMATION]: 'var(--category-color-automation)',        // Pink
  [SubcategoryId.GENERAL]: 'var(--category-color-general)',           // Blue
  [SubcategoryId.ADVANCED_FORMATTING]: 'var(--category-color-formatting)', // Purple
  [SubcategoryId.DEVELOPER_TOOLS]: 'var(--category-color-developer)',   // Gray
};

export const getSubcategoryIcon = (subcategory: SubcategoryId): React.ReactNode => {
  const iconMap: Record<SubcategoryId, string> = {
    [SubcategoryId.SIGNING]: 'draw-rounded',
    [SubcategoryId.DOCUMENT_SECURITY]: 'security-rounded',
    [SubcategoryId.VERIFICATION]: 'verified-user-rounded',
    [SubcategoryId.DOCUMENT_REVIEW]: 'rate-review-rounded',
    [SubcategoryId.PAGE_FORMATTING]: 'view-week',
    [SubcategoryId.EXTRACTION]: 'download-rounded',
    [SubcategoryId.REMOVAL]: 'delete-sweep-rounded',
    [SubcategoryId.AUTOMATION]: 'smart-toy-rounded',
    [SubcategoryId.GENERAL]: 'build-rounded',
    [SubcategoryId.ADVANCED_FORMATTING]: 'tune-rounded',
    [SubcategoryId.DEVELOPER_TOOLS]: 'code-rounded',
  };

  const iconName = iconMap[subcategory] || 'build-rounded';
  return React.createElement(LocalIcon, { icon: iconName, width: 24, height: 24 });
};

export const getCategoryLabel = (t: TFunction, id: ToolCategoryId): string => t(`toolPicker.categories.${id}`, id);
export const getSubcategoryLabel = (t: TFunction, id: SubcategoryId): string => t(`toolPicker.subcategories.${id}`, id);
export const getSubcategoryColor = (subcategory: SubcategoryId): string => SUBCATEGORY_COLOR_MAP[subcategory] || '#7882FF';



export const getAllEndpoints = (registry: ToolRegistry): string[] => {
  const lists: string[][] = [];
  Object.values(registry).forEach(entry => {
    if (entry.endpoints && entry.endpoints.length > 0) {
      lists.push(entry.endpoints);
    }
  });
  return Array.from(new Set(lists.flat()));
};

export const getConversionEndpoints = (extensionToEndpoint: Record<string, Record<string, string>>): string[] => {
  const endpoints = new Set<string>();
  Object.values(extensionToEndpoint).forEach(toEndpoints => {
    Object.values(toEndpoints).forEach(endpoint => {
      endpoints.add(endpoint);
    });
  });
  return Array.from(endpoints);
};

export const getAllApplicationEndpoints = (
  registry: ToolRegistry,
  extensionToEndpoint?: Record<string, Record<string, string>>
): string[] => {
  const toolEp = getAllEndpoints(registry);
  const convEp = extensionToEndpoint ? getConversionEndpoints(extensionToEndpoint) : [];
  return Array.from(new Set([...toolEp, ...convEp]));
};

/**
 * Default workbench for tools that don't specify one
 * Returns null to trigger the default case in Workbench component (ToolRenderer)
 */
export const getDefaultToolWorkbench = (): WorkbenchType => 'fileEditor';

/**
 * Get workbench type for a tool
 */
export const getToolWorkbench = (tool: ToolRegistryEntry): WorkbenchType => {
  return tool.workbench || getDefaultToolWorkbench();
};

/**
 * Get URL path for a tool
 */
export const getToolUrlPath = (toolId: string): string => {
  return `/${toolId.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
};

/**
 * Check if a tool ID exists in the registry
 */
export const isValidToolId = (toolId: string, registry: ToolRegistry): boolean => {
  return toolId in registry;
};

/**
 * Check if a tool supports automation (defaults to true)
 */
export const getToolSupportsAutomate = (tool: ToolRegistryEntry): boolean => {
  return tool.supportsAutomate !== false;
};
