import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  HotkeyBinding,
  bindingEquals,
  bindingMatchesEvent,
  deserializeBindings,
  getDisplayParts,
  isMacLike,
  normalizeBinding,
  serializeBindings,
} from "@app/utils/hotkeys";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { ToolId, isValidToolId } from "@app/types/toolId";
import { ToolCategoryId, ToolRegistryEntry } from "@app/data/toolsTaxonomy";
import {
  HOTKEY_ACTIONS,
  HotkeyActionId,
  generateDefaultActionBindings,
  isHotkeyActionId,
} from "@app/data/hotkeyActions";

export type HotkeyKey = ToolId | HotkeyActionId;
type Bindings = Partial<Record<HotkeyKey, HotkeyBinding>>;

type ActionHandler = () => void;

interface HotkeyContextValue {
  hotkeys: Bindings;
  defaults: Bindings;
  isMac: boolean;
  updateHotkey: (key: HotkeyKey, binding: HotkeyBinding) => void;
  resetHotkey: (key: HotkeyKey) => void;
  isBindingAvailable: (
    binding: HotkeyBinding,
    excludeKey?: HotkeyKey,
  ) => boolean;
  pauseHotkeys: () => void;
  resumeHotkeys: () => void;
  areHotkeysPaused: boolean;
  getDisplayParts: (binding: HotkeyBinding | null | undefined) => string[];
  registerActionHandler: (
    actionId: HotkeyActionId,
    handler: ActionHandler,
  ) => () => void;
}

const HotkeyContext = createContext<HotkeyContextValue | undefined>(undefined);

const STORAGE_KEY = "stirlingpdf.hotkeys";

const generateDefaultHotkeys = (
  toolEntries: [ToolId, ToolRegistryEntry][],
  macLike: boolean,
): Bindings => {
  const defaults: Bindings = {};

  // Get Quick Access tools (RECOMMENDED_TOOLS category) from registry
  const quickAccessTools = toolEntries
    .filter(([_, tool]) => tool.categoryId === ToolCategoryId.RECOMMENDED_TOOLS)
    .map(([toolId, _]) => toolId);

  // Assign Cmd+Option+Number (Mac) or Ctrl+Alt+Number (Windows) to Quick Access tools
  quickAccessTools.forEach((toolId, index) => {
    if (index < 9) {
      // Limit to Digit1-9
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

  // Action defaults (e.g. file cycling). May be empty in browser builds.
  Object.assign(defaults, generateDefaultActionBindings(macLike));

  return defaults;
};

const shouldIgnoreTarget = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const editable = target.closest(
    'input, textarea, [contenteditable="true"], [role="textbox"]',
  );
  return Boolean(editable);
};

export const HotkeyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { toolRegistry, handleToolSelect } = useToolWorkflow();
  const isMac = useMemo(() => isMacLike(), []);
  const [customBindings, setCustomBindings] = useState<Bindings>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    return deserializeBindings(window.localStorage?.getItem(STORAGE_KEY));
  });
  const [areHotkeysPaused, setHotkeysPaused] = useState(false);
  const actionHandlersRef = useRef<Map<HotkeyActionId, ActionHandler>>(
    new Map(),
  );

  const toolEntries = useMemo(
    () => Object.entries(toolRegistry),
    [toolRegistry],
  ) as [ToolId, ToolRegistryEntry][];

  const defaults = useMemo(
    () => generateDefaultHotkeys(toolEntries, isMac),
    [toolRegistry, isMac],
  );

  // Drop persisted bindings whose key is no longer recognised. Tools may be
  // removed by feature flags / build flavour; actions are removed if their ID
  // is retired. Keep everything else untouched.
  useEffect(() => {
    setCustomBindings((prev) => {
      const next: Bindings = {};
      let changed = false;
      (Object.entries(prev) as [HotkeyKey, HotkeyBinding][]).forEach(
        ([key, binding]) => {
          const isKnownTool = isValidToolId(key) && Boolean(toolRegistry[key]);
          const isKnownAction = isHotkeyActionId(key);
          if (isKnownTool || isKnownAction) {
            next[key] = binding;
          } else {
            changed = true;
          }
        },
      );
      return changed ? next : prev;
    });
  }, [toolRegistry]);

  const resolved = useMemo(() => {
    const merged: Bindings = {};
    const keys = new Set<HotkeyKey>([
      ...(toolEntries.map(([id]) => id) as HotkeyKey[]),
      ...(Object.keys(HOTKEY_ACTIONS) as HotkeyKey[]),
    ]);
    keys.forEach((key) => {
      const custom = customBindings[key];
      const defaultBinding = defaults[key];
      if (custom) {
        merged[key] = normalizeBinding(custom);
      } else if (defaultBinding) {
        merged[key] = defaultBinding;
      }
    });
    return merged;
  }, [customBindings, defaults, toolEntries]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, serializeBindings(customBindings));
  }, [customBindings]);

  const isBindingAvailable = useCallback(
    (binding: HotkeyBinding, excludeKey?: HotkeyKey) => {
      const normalized = normalizeBinding(binding);
      return (Object.entries(resolved) as [HotkeyKey, HotkeyBinding][]).every(
        ([key, existing]) => {
          if (key === excludeKey) {
            return true;
          }
          return !bindingEquals(existing, normalized);
        },
      );
    },
    [resolved],
  );

  const updateHotkey = useCallback(
    (key: HotkeyKey, binding: HotkeyBinding) => {
      setCustomBindings((prev) => {
        const normalized = normalizeBinding(binding);
        const defaultsForKey = defaults[key];
        const next = { ...prev };
        if (defaultsForKey && bindingEquals(defaultsForKey, normalized)) {
          delete next[key];
        } else {
          next[key] = normalized;
        }
        return next;
      });
    },
    [defaults],
  );

  const resetHotkey = useCallback((key: HotkeyKey) => {
    setCustomBindings((prev) => {
      if (!(key in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const pauseHotkeys = useCallback(() => setHotkeysPaused(true), []);
  const resumeHotkeys = useCallback(() => setHotkeysPaused(false), []);

  const registerActionHandler = useCallback(
    (actionId: HotkeyActionId, handler: ActionHandler) => {
      actionHandlersRef.current.set(actionId, handler);
      return () => {
        const current = actionHandlersRef.current.get(actionId);
        if (current === handler) {
          actionHandlersRef.current.delete(actionId);
        }
      };
    },
    [],
  );

  useEffect(() => {
    if (areHotkeysPaused) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      // eslint-disable-next-line no-console
      console.log("[Hotkeys] keydown", {
        code: event.code,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
        ignored: shouldIgnoreTarget(event.target),
      });
      if (shouldIgnoreTarget(event.target)) return;

      const entries = Object.entries(resolved) as [HotkeyKey, HotkeyBinding][];
      for (const [key, binding] of entries) {
        if (bindingMatchesEvent(binding, event)) {
          if (isHotkeyActionId(key)) {
            const actionHandler = actionHandlersRef.current.get(key);
            // eslint-disable-next-line no-console
            console.log(
              "[Hotkeys] action match",
              key,
              "handlerRegistered:",
              Boolean(actionHandler),
            );
            if (!actionHandler) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            actionHandler();
          } else {
            // eslint-disable-next-line no-console
            console.log("[Hotkeys] tool match", key);
            event.preventDefault();
            event.stopPropagation();
            handleToolSelect(key as ToolId);
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [resolved, areHotkeysPaused, handleToolSelect]);

  const contextValue = useMemo<HotkeyContextValue>(
    () => ({
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
      registerActionHandler,
    }),
    [
      resolved,
      defaults,
      isMac,
      updateHotkey,
      resetHotkey,
      isBindingAvailable,
      pauseHotkeys,
      resumeHotkeys,
      areHotkeysPaused,
      registerActionHandler,
    ],
  );

  return (
    <HotkeyContext.Provider value={contextValue}>
      {children}
    </HotkeyContext.Provider>
  );
};

export const useHotkeys = (): HotkeyContextValue => {
  const context = useContext(HotkeyContext);
  if (!context) {
    throw new Error("useHotkeys must be used within a HotkeyProvider");
  }
  return context;
};
