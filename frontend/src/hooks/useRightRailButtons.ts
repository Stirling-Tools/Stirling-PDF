import { useEffect } from 'react';
import { useRightRail } from '../contexts/RightRailContext';
import { RightRailAction, RightRailButtonConfig } from '../types/rightRail';

export interface RightRailButtonWithAction extends RightRailButtonConfig {
  onClick: RightRailAction;
}

/**
 * Registers one or more RightRail buttons and their actions.
 * - Automatically registers on mount and unregisters on unmount
 * - Updates registration when the input array reference changes
 */
export function useRightRailButtons(buttons: RightRailButtonWithAction[]) {
  const { registerButtons, unregisterButtons, setAction } = useRightRail();

  useEffect(() => {
    if (!buttons || buttons.length === 0) return;

    // Register visual button configs (without onClick)
    registerButtons(buttons.map(({ onClick, ...cfg }) => cfg));

    // Bind actions
    buttons.forEach(({ id, onClick }) => setAction(id, onClick));

    // Cleanup
    return () => {
      unregisterButtons(buttons.map(b => b.id));
    };
  }, [registerButtons, unregisterButtons, setAction, buttons]);
}
