import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { WorkbenchBarAction, WorkbenchBarButtonConfig } from '@app/types/workbenchBar';

interface WorkbenchBarContextValue {
	buttons: WorkbenchBarButtonConfig[];
	actions: Record<string, WorkbenchBarAction>;
	allButtonsDisabled: boolean;
	registerButtons: (buttons: WorkbenchBarButtonConfig[]) => void;
	unregisterButtons: (ids: string[]) => void;
	setAction: (id: string, action?: WorkbenchBarAction) => void;
	setAllWorkbenchBarButtonsDisabled: (disabled: boolean) => void;
	clear: () => void;
}

const WorkbenchBarContext = createContext<WorkbenchBarContextValue | undefined>(undefined);

export function WorkbenchBarProvider({ children }: { children: React.ReactNode }) {
	const [buttons, setButtons] = useState<WorkbenchBarButtonConfig[]>([]);
	const [actions, setActions] = useState<Record<string, WorkbenchBarAction>>({});
	const [allButtonsDisabled, setAllButtonsDisabled] = useState<boolean>(false);

	const registerButtons = useCallback((newButtons: WorkbenchBarButtonConfig[]) => {
		setButtons(prev => {
			const byId = new Map(prev.map(b => [b.id, b] as const));
			newButtons.forEach(nb => {
				const existing = byId.get(nb.id) || ({} as WorkbenchBarButtonConfig);
				byId.set(nb.id, { ...existing, ...nb });
			});
			const merged = Array.from(byId.values());
			merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
			if (process.env.NODE_ENV === 'development') {
				const ids = newButtons.map(b => b.id);
				const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
				if (dupes.length) console.warn('[WorkbenchBar] Duplicate ids in registerButtons:', dupes);
			}
			return merged;
		});
	}, []);

	const unregisterButtons = useCallback((ids: string[]) => {
		setButtons(prev => prev.filter(b => !ids.includes(b.id)));
		setActions(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))));
	}, []);

	const setAction = useCallback((id: string, action?: WorkbenchBarAction) => {
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

	const setAllWorkbenchBarButtonsDisabled = useCallback((disabled: boolean) => {
		setAllButtonsDisabled(disabled);
	}, []);

	const clear = useCallback(() => {
		setButtons([]);
		setActions({});
	}, []);

	const value = useMemo<WorkbenchBarContextValue>(() => ({ 
		buttons, 
		actions, 
		allButtonsDisabled, 
		registerButtons, 
		unregisterButtons, 
		setAction, 
		setAllWorkbenchBarButtonsDisabled, 
		clear 
	}), [buttons, actions, allButtonsDisabled, registerButtons, unregisterButtons, setAction, setAllWorkbenchBarButtonsDisabled, clear]);

	return (
		<WorkbenchBarContext.Provider value={value}>
			{children}
		</WorkbenchBarContext.Provider>
	);
}

export function useWorkbenchBar() {
	const ctx = useContext(WorkbenchBarContext);
	if (!ctx) throw new Error('useWorkbenchBar must be used within WorkbenchBarProvider');
	return ctx;
}
