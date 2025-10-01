import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { HotkeyBinding, bindingEquals, bindingMatchesEvent, deserializeBindings, getDisplayParts, isMacLike, normalizeBinding, serializeBindings } from '../utils/hotkeys';
import { useToolWorkflow } from './ToolWorkflowContext';
import { ToolId } from '../types/toolId';

interface HotkeyContextValue {
  hotkeys: Record<string, HotkeyBinding>;
  defaults: Record<string, HotkeyBinding>;
  isMac: boolean;
  updateHotkey: (toolId: string, binding: HotkeyBinding) => void;
  resetHotkey: (toolId: string) => void;
  isBindingAvailable: (binding: HotkeyBinding, excludeToolId?: string) => boolean;
  pauseHotkeys: () => void;
  resumeHotkeys: () => void;
  areHotkeysPaused: boolean;
  getDisplayParts: (binding: HotkeyBinding | null | undefined) => string[];
}

const HotkeyContext = createContext<HotkeyContextValue | undefined>(undefined);

const STORAGE_KEY = 'stirlingpdf.hotkeys';

const KEY_ORDER: string[] = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
];

const generateDefaultHotkeys = (toolIds: string[], macLike: boolean): Record<string, HotkeyBinding> => {
  const defaults: Record<string, HotkeyBinding> = {};
  let index = 0;
  let useShift = false;

  const nextBinding = (): HotkeyBinding => {
    if (index >= KEY_ORDER.length) {
      index = 0;
      if (!useShift) {
        useShift = true;
      } else {
        // If we somehow run out of combinations, wrap back around (unlikely given tool count)
        useShift = false;
      }
    }

    const code = KEY_ORDER[index];
    index += 1;

    return {
      code,
      alt: true,
      shift: useShift,
      meta: macLike,
      ctrl: !macLike,
    };
  };

  toolIds.forEach(toolId => {
    defaults[toolId] = nextBinding();
  });

  return defaults;
};

const shouldIgnoreTarget = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const editable = target.closest('input, textarea, [contenteditable="true"], [role="textbox"]');
  return Boolean(editable);
};

export const HotkeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toolRegistry, handleToolSelect } = useToolWorkflow();
  const isMac = useMemo(() => isMacLike(), []);
  const [customBindings, setCustomBindings] = useState<Record<string, HotkeyBinding>>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    return deserializeBindings(window.localStorage?.getItem(STORAGE_KEY));
  });
  const [areHotkeysPaused, setHotkeysPaused] = useState(false);

  const toolIds = useMemo(() => Object.keys(toolRegistry), [toolRegistry]);

  const defaults = useMemo(() => generateDefaultHotkeys(toolIds, isMac), [toolIds, isMac]);

  // Remove bindings for tools that are no longer present
  useEffect(() => {
    setCustomBindings(prev => {
      const next: Record<string, HotkeyBinding> = {};
      let changed = false;
      Object.entries(prev).forEach(([toolId, binding]) => {
        if (toolRegistry[toolId]) {
          next[toolId] = binding;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [toolRegistry]);

  const resolved = useMemo(() => {
    const merged: Record<string, HotkeyBinding> = {};
    toolIds.forEach(toolId => {
      const custom = customBindings[toolId];
      merged[toolId] = custom ? normalizeBinding(custom) : defaults[toolId];
    });
    return merged;
  }, [customBindings, defaults, toolIds]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, serializeBindings(customBindings));
  }, [customBindings]);

  const isBindingAvailable = useCallback((binding: HotkeyBinding, excludeToolId?: string) => {
    const normalized = normalizeBinding(binding);
    return Object.entries(resolved).every(([toolId, existing]) => {
      if (toolId === excludeToolId) {
        return true;
      }
      return !bindingEquals(existing, normalized);
    });
  }, [resolved]);

  const updateHotkey = useCallback((toolId: string, binding: HotkeyBinding) => {
    setCustomBindings(prev => {
      const normalized = normalizeBinding(binding);
      const defaultsForTool = defaults[toolId];
      const next = { ...prev };
      if (defaultsForTool && bindingEquals(defaultsForTool, normalized)) {
        delete next[toolId];
      } else {
        next[toolId] = normalized;
      }
      return next;
    });
  }, [defaults]);

  const resetHotkey = useCallback((toolId: string) => {
    setCustomBindings(prev => {
      if (!(toolId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[toolId];
      return next;
    });
  }, []);

  const pauseHotkeys = useCallback(() => setHotkeysPaused(true), []);
  const resumeHotkeys = useCallback(() => setHotkeysPaused(false), []);

  useEffect(() => {
    if (areHotkeysPaused) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (shouldIgnoreTarget(event.target)) return;

      const entries = Object.entries(resolved) as Array<[string, HotkeyBinding]>;
      for (const [toolId, binding] of entries) {
        if (bindingMatchesEvent(binding, event)) {
          event.preventDefault();
          event.stopPropagation();
          handleToolSelect(toolId as ToolId);
          break;
        }
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
    };
  }, [resolved, areHotkeysPaused, handleToolSelect]);

  const contextValue = useMemo<HotkeyContextValue>(() => ({
    hotkeys: resolved,
    defaults,
    isMac,
    updateHotkey,
    resetHotkey,
    isBindingAvailable,
    pauseHotkeys,
    resumeHotkeys,
    areHotkeysPaused,
    getDisplayParts: (binding) => getDisplayParts(binding ?? null, isMac),
  }), [resolved, defaults, isMac, updateHotkey, resetHotkey, isBindingAvailable, pauseHotkeys, resumeHotkeys, areHotkeysPaused]);

  return (
    <HotkeyContext.Provider value={contextValue}>
      {children}
    </HotkeyContext.Provider>
  );
};

export const useHotkeys = (): HotkeyContextValue => {
  const context = useContext(HotkeyContext);
  if (!context) {
    throw new Error('useHotkeys must be used within a HotkeyProvider');
  }
  return context;
};