import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { RightRailAction, RightRailButtonConfig } from '@app/types/rightRail';

interface RightRailContextValue {
	buttons: RightRailButtonConfig[];
	actions: Record<string, RightRailAction>;
	allButtonsDisabled: boolean;
	registerButtons: (buttons: RightRailButtonConfig[]) => void;
	unregisterButtons: (ids: string[]) => void;
	setAction: (id: string, action?: RightRailAction) => void;
	setAllRightRailButtonsDisabled: (disabled: boolean) => void;
	clear: () => void;
}

const RightRailContext = createContext<RightRailContextValue | undefined>(undefined);

export function RightRailProvider({ children }: { children: React.ReactNode }) {
	const [buttons, setButtons] = useState<RightRailButtonConfig[]>([]);
	const [actions, setActions] = useState<Record<string, RightRailAction>>({});
	const [allButtonsDisabled, setAllButtonsDisabled] = useState<boolean>(false);

	const registerButtons = useCallback((newButtons: RightRailButtonConfig[]) => {
		setButtons(prev => {
			const byId = new Map(prev.map(b => [b.id, b] as const));
			newButtons.forEach(nb => {
				const existing = byId.get(nb.id) || ({} as RightRailButtonConfig);
				byId.set(nb.id, { ...existing, ...nb });
			});
			const merged = Array.from(byId.values());
			merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
			if (process.env.NODE_ENV === 'development') {
				const ids = newButtons.map(b => b.id);
				const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
				if (dupes.length) console.warn('[RightRail] Duplicate ids in registerButtons:', dupes);
			}
			return merged;
		});
	}, []);

	const unregisterButtons = useCallback((ids: string[]) => {
		setButtons(prev => prev.filter(b => !ids.includes(b.id)));
		setActions(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))));
	}, []);

	const setAction = useCallback((id: string, action?: RightRailAction) => {
		setActions(prev => {
			if (!action) {
				if (!(id in prev)) return prev;
				const next = { ...prev };
				delete next[id];
				return next;
			}
			return { ...prev, [id]: action };
		});
	}, []);

	const setAllRightRailButtonsDisabled = useCallback((disabled: boolean) => {
		setAllButtonsDisabled(disabled);
	}, []);

	const clear = useCallback(() => {
		setButtons([]);
		setActions({});
	}, []);

	const value = useMemo<RightRailContextValue>(() => ({ 
		buttons, 
		actions, 
		allButtonsDisabled, 
		registerButtons, 
		unregisterButtons, 
		setAction, 
		setAllRightRailButtonsDisabled, 
		clear 
	}), [buttons, actions, allButtonsDisabled, registerButtons, unregisterButtons, setAction, setAllRightRailButtonsDisabled, clear]);

	return (
		<RightRailContext.Provider value={value}>
			{children}
		</RightRailContext.Provider>
	);
}

export function useRightRail() {
	const ctx = useContext(RightRailContext);
	if (!ctx) throw new Error('useRightRail must be used within RightRailProvider');
	return ctx;
}
