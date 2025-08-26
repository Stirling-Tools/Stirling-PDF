import React from 'react';

export type RightRailSection = 'top' | 'middle' | 'bottom';

export interface RightRailButtonConfig {
	/** Unique id for the button, also used to bind action callbacks */
	id: string;
	/** Icon element to render */
	icon: React.ReactNode;
	/** Tooltip content (can be localized node) */
	tooltip: React.ReactNode;
	/** Optional ARIA label for a11y (separate from visual tooltip) */
	ariaLabel?: string;
	/** Optional i18n key carried by config */
	templateKey?: string;
	/** Visual grouping lane */
	section?: RightRailSection;
	/** Sorting within a section (lower first); ties broken by id */
	order?: number;
	/** Initial disabled state */
	disabled?: boolean;
	/** Initial visibility */
	visible?: boolean;
}

export type RightRailAction = () => void;
