import { useEffect, useMemo } from 'react';
import { useWorkbenchBar } from '@app/contexts/WorkbenchBarContext';
import { WorkbenchBarAction, WorkbenchBarButtonConfig } from '@app/types/workbenchBar';

export interface WorkbenchBarButtonWithAction extends WorkbenchBarButtonConfig {
  onClick?: WorkbenchBarAction;
}

/**
 * Registers one or more WorkbenchBar buttons and their actions.
 * - Automatically registers on mount and unregisters on unmount
 * - Updates registration when the input array reference changes
 */
export function useWorkbenchBarButtons(buttons: readonly WorkbenchBarButtonWithAction[]) {
  const { registerButtons, unregisterButtons, setAction } = useWorkbenchBar();

  // Memoize configs and ids to reduce churn
  const configs: WorkbenchBarButtonConfig[] = useMemo(
    () => buttons.map(({ onClick, ...cfg }) => cfg),
    [buttons]
  );
  const ids: string[] = useMemo(() => buttons.map(b => b.id), [buttons]);

  useEffect(() => {
    if (!buttons || buttons.length === 0) return;

    // DEV warnings for duplicate ids or missing handlers
    if (process.env.NODE_ENV === 'development') {
      const idSet = new Set<string>();
      buttons.forEach(b => {
        if (!b.onClick && !b.render) console.warn('[WorkbenchBar] Missing onClick/render for id:', b.id);
        if (idSet.has(b.id)) console.warn('[WorkbenchBar] Duplicate id in buttons array:', b.id);
        idSet.add(b.id);
      });
    }

    // Register visual button configs (idempotent merge by id)
    registerButtons(configs);

    // Bind/update actions independent of registration
    buttons.forEach(({ id, onClick }) => setAction(id, onClick));

    // Cleanup unregisters by ids present in this call
    return () => unregisterButtons(ids);
  }, [registerButtons, unregisterButtons, setAction, configs, ids, buttons]);
}
