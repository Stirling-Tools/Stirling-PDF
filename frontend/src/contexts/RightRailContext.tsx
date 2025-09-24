import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { RightRailAction, RightRailButtonConfig } from '../types/rightRail';

interface RightRailContextValue {
	buttons: RightRailButtonConfig[];
	actions: Record<string, RightRailAction>;
	registerButtons: (buttons: RightRailButtonConfig[]) => void;
	unregisterButtons: (ids: string[]) => void;
	setAction: (id: string, action: RightRailAction) => void;
	clear: () => void;
}

const RightRailContext = createContext<RightRailContextValue | undefined>(undefined);

export function RightRailProvider({ children }: { children: React.ReactNode }) {
	const [buttons, setButtons] = useState<RightRailButtonConfig[]>([]);
	const [actions, setActions] = useState<Record<string, RightRailAction>>({});

	const registerButtons = useCallback((newButtons: RightRailButtonConfig[]) => {
		setButtons(prev => {
			const byId = new Map(prev.map(b => [b.id, b] as const));
			newButtons.forEach(nb => {
				const existing = byId.get(nb.id) ?? ({} as RightRailButtonConfig);
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

	const setAction = useCallback((id: string, action: RightRailAction) => {
		setActions(prev => ({ ...prev, [id]: action }));
	}, []);

	const clear = useCallback(() => {
		setButtons([]);
		setActions({});
	}, []);

	const value = useMemo<RightRailContextValue>(() => ({ buttons, actions, registerButtons, unregisterButtons, setAction, clear }), [buttons, actions, registerButtons, unregisterButtons, setAction, clear]);

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
