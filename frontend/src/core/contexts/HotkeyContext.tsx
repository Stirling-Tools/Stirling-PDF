import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { HotkeyBinding, bindingEquals, bindingMatchesEvent, deserializeBindings, getDisplayParts, isMacLike, normalizeBinding, serializeBindings } from '@app/utils/hotkeys';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { ToolId } from '@app/types/toolId';
import { ToolCategoryId, ToolRegistryEntry } from '@app/data/toolsTaxonomy';

type Bindings = Partial<Record<ToolId, HotkeyBinding>>;

interface HotkeyContextValue {
  hotkeys: Bindings;
  defaults: Bindings;
  isMac: boolean;
  updateHotkey: (toolId: ToolId, binding: HotkeyBinding) => void;
  resetHotkey: (toolId: ToolId) => void;
  isBindingAvailable: (binding: HotkeyBinding, excludeToolId?: ToolId) => boolean;
  pauseHotkeys: () => void;
  resumeHotkeys: () => void;
  areHotkeysPaused: boolean;
  getDisplayParts: (binding: HotkeyBinding | null | undefined) => string[];
}

const HotkeyContext = createContext<HotkeyContextValue | undefined>(undefined);

const STORAGE_KEY = 'stirlingpdf.hotkeys';

const generateDefaultHotkeys = (toolEntries: [ToolId, ToolRegistryEntry][], macLike: boolean): Bindings => {
  const defaults: Bindings = {};

  // Get Quick Access tools (RECOMMENDED_TOOLS category) from registry
  const quickAccessTools = toolEntries
    .filter(([_, tool]) => tool.categoryId === ToolCategoryId.RECOMMENDED_TOOLS)
    .map(([toolId, _]) => toolId);

  // Assign Cmd+Option+Number (Mac) or Ctrl+Alt+Number (Windows) to Quick Access tools
  quickAccessTools.forEach((toolId, index) => {
    if (index < 9) { // Limit to Digit1-9
      const digitNumber = index + 1;
      defaults[toolId] = {
        code: `Digit${digitNumber}`,
        alt: true,
        shift: false,
        meta: macLike,
        ctrl: !macLike,
      };
    }
  });

  // All other tools have no default (will be undefined in the record)
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
  const [customBindings, setCustomBindings] = useState<Bindings>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    return deserializeBindings(window.localStorage?.getItem(STORAGE_KEY));
  });
  const [areHotkeysPaused, setHotkeysPaused] = useState(false);

  const toolEntries = useMemo(() => Object.entries(toolRegistry), [toolRegistry]) as [ToolId, ToolRegistryEntry][];

  const defaults = useMemo(() => generateDefaultHotkeys(toolEntries, isMac), [toolRegistry, isMac]);

  // Remove bindings for tools that are no longer present
  useEffect(() => {
    setCustomBindings(prev => {
      const next: Bindings = {};
      let changed = false;
      (Object.entries(prev) as [ToolId, HotkeyBinding][]).forEach(([toolId, binding]) => {
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
    const merged: Bindings = {};
    toolEntries.forEach(([toolId, _]) => {
      const custom = customBindings[toolId];
      const defaultBinding = defaults[toolId];

      // Only add to resolved if there's a custom binding or a default binding
      if (custom) {
        merged[toolId] = normalizeBinding(custom);
      } else if (defaultBinding) {
        merged[toolId] = defaultBinding;
      }
      // If neither exists, don't add to merged (tool has no hotkey)
    });
    return merged;
  }, [customBindings, defaults, toolEntries]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, serializeBindings(customBindings));
  }, [customBindings]);

  const isBindingAvailable = useCallback((binding: HotkeyBinding, excludeToolId?: ToolId) => {
    const normalized = normalizeBinding(binding);
    return Object.entries(resolved).every(([toolId, existing]) => {
      if (toolId === excludeToolId) {
        return true;
      }
      return !bindingEquals(existing, normalized);
    });
  }, [resolved]);

  const updateHotkey = useCallback((toolId: ToolId, binding: HotkeyBinding) => {
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

  const resetHotkey = useCallback((toolId: ToolId) => {
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

      const entries = Object.entries(resolved) as [ToolId, HotkeyBinding][];
      for (const [toolId, binding] of entries) {
        if (bindingMatchesEvent(binding, event)) {
          event.preventDefault();
          event.stopPropagation();
          handleToolSelect(toolId);
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
