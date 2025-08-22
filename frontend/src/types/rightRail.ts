import React from 'react';

export interface RightRailButtonConfig {
	id: string; // unique id for the button, also used to bind action callbacks
	icon: React.ReactNode;
	tooltip: string;
	section?: 'top' | 'middle' | 'bottom';
	order?: number;
	disabled?: boolean;
	visible?: boolean;
}

export type RightRailAction = () => void;
