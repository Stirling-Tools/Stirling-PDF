import { type TFunction } from 'i18next';
import React from 'react';
import { ToolOperationHook } from '../hooks/tools/shared/useToolOperation';
import { BaseToolProps } from '../types/tool';

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

export enum ToolCategory {
	STANDARD_TOOLS = 'Standard Tools',
	ADVANCED_TOOLS = 'Advanced Tools',
	RECOMMENDED_TOOLS = 'Recommended Tools'
}

export type ToolRegistryEntry = {
	icon: React.ReactNode;
	name: string;
	component: React.ComponentType<BaseToolProps> | null;
	view: 'sign' | 'security' | 'format' | 'extract' | 'view' | 'merge' | 'pageEditor' | 'convert' | 'redact' | 'split' | 'convert' | 'remove' | 'compress' | 'external';
	description: string;
	category: ToolCategory;
	subcategory: SubcategoryId;
	maxFiles?: number;
	supportedFormats?: string[];
	endpoints?: string[];
	link?: string;
	type?: string;
	// Hook for automation execution
	operationHook?: () => ToolOperationHook<any>;
}

export type ToolRegistry = Record<string, ToolRegistryEntry>;

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
	[SubcategoryId.SIGNING]: '#FF7892',
	[SubcategoryId.DOCUMENT_SECURITY]: '#FF7892',
	[SubcategoryId.VERIFICATION]: '#1BB1D4',
	[SubcategoryId.DOCUMENT_REVIEW]: '#48BD54',
	[SubcategoryId.PAGE_FORMATTING]: '#7882FF',
	[SubcategoryId.EXTRACTION]: '#1BB1D4',
	[SubcategoryId.REMOVAL]: '#7882FF',
	[SubcategoryId.AUTOMATION]: '#69DC95',
	[SubcategoryId.GENERAL]: '#69DC95',
	[SubcategoryId.ADVANCED_FORMATTING]: '#F55454',
	[SubcategoryId.DEVELOPER_TOOLS]: '#F55454',
};

export const getSubcategoryColor = (subcategory: SubcategoryId): string => SUBCATEGORY_COLOR_MAP[subcategory] || '#7882FF';

export const getSubcategoryLabel = (t: TFunction, id: SubcategoryId): string => t(`toolPicker.subcategories.${id}`, id);



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
