import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ToolRegistryEntry } from '../data/toolsTaxonomy';
import { useToolWorkflow } from './ToolWorkflowContext';
import { ToolId, isValidToolId } from '../types/toolId';
import {
  KEY_SEQUENCE,
  captureShortcut,
  detectIsMac,
  formatShortcutParts,
  isEditableElement,
  mapKeyToToken,
  normalizeShortcutString,
  SupportedModifier,
} from '../utils/hotkeys';

const STORAGE_KEY = 'stirling.hotkeys';

type HotkeyMap = Record<string, string>;

interface HotkeyContextValue {
  hotkeys: HotkeyMap;
  defaultHotkeys: HotkeyMap;
  customHotkeys: HotkeyMap;
  getShortcutForTool: (toolId: string) => string | undefined;
  formatShortcut: (shortcut: string) => string[];
  updateHotkey: (toolId: string, shortcut: string) => void;
  resetHotkey: (toolId: string) => void;
  resetAllHotkeys: () => void;
  isShortcutAvailable: (shortcut: string, excludeToolId?: string) => boolean;
  setCaptureActive: (active: boolean) => void;
  platform: 'mac' | 'windows';
}

const HotkeyContext = createContext<HotkeyContextValue | undefined>(undefined);

function loadStoredHotkeys(): HotkeyMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const sanitized: HotkeyMap = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([toolId, shortcut]) => {
      if (typeof shortcut !== 'string') return;
      const normalized = normalizeShortcutString(shortcut);
      if (normalized) {
        sanitized[toolId] = normalized;
      }
    });
    return sanitized;
  } catch {
    return {};
  }
}

function persistHotkeys(hotkeys: HotkeyMap) {
  if (typeof window === 'undefined') return;
  if (Object.keys(hotkeys).length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hotkeys));
}

function generateDefaultHotkeys(
  registry: Record<string, ToolRegistryEntry>,
  isMac: boolean
): HotkeyMap {
  const toolIds = Object.keys(registry);
  if (toolIds.length === 0) return {};

  const primaryModifier: SupportedModifier = isMac ? 'meta' : 'ctrl';
  const defaults: HotkeyMap = {};

  toolIds.forEach((toolId, index) => {
    const keyCandidate = KEY_SEQUENCE[index % KEY_SEQUENCE.length];
    if (!keyCandidate) return;
    const token = mapKeyToToken(keyCandidate);
    if (!token) return;

    const cycle = Math.floor(index / KEY_SEQUENCE.length);
    let combination = `${primaryModifier}+alt+shift+${token}`;
    if (cycle === 1) {
      combination = `${primaryModifier}+shift+${token}`;
    } else if (cycle === 2) {
      combination = `${primaryModifier}+alt+${token}`;
    } else if (cycle >= 3) {
      combination = `${primaryModifier}+${token}`;
    }

    const normalized = normalizeShortcutString(combination);
    if (normalized) {
      defaults[toolId] = normalized;
    }
  });

  return defaults;
}

export function HotkeyProvider({ children }: { children: React.ReactNode }) {
  const { toolRegistry, handleToolSelect } = useToolWorkflow();
  const registry = useMemo(
    () => (toolRegistry || {}) as Record<string, ToolRegistryEntry>,
    [toolRegistry]
  );
  const isMac = useMemo(() => detectIsMac(), []);

  const [customHotkeys, setCustomHotkeys] = useState<HotkeyMap>(() => loadStoredHotkeys());
  const [captureActiveState, setCaptureActiveState] = useState(false);
  const captureActiveRef = useRef(false);

  useEffect(() => {
    captureActiveRef.current = captureActiveState;
  }, [captureActiveState]);

  const defaultHotkeys = useMemo(
    () => generateDefaultHotkeys(registry, isMac),
    [registry, isMac]
  );

  useEffect(() => {
    setCustomHotkeys(prev => {
      const filteredEntries = Object.entries(prev).filter(([toolId]) => toolId in registry);
      if (filteredEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(filteredEntries);
    });
  }, [registry]);

  useEffect(() => {
    persistHotkeys(customHotkeys);
  }, [customHotkeys]);

  const hotkeys = useMemo(() => {
    const map: HotkeyMap = { ...defaultHotkeys };
    Object.entries(customHotkeys).forEach(([toolId, shortcut]) => {
      map[toolId] = shortcut;
    });
    return map;
  }, [defaultHotkeys, customHotkeys]);

  const shortcutLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    Object.entries(hotkeys).forEach(([toolId, shortcut]) => {
      const normalized = normalizeShortcutString(shortcut);
      if (normalized) {
        lookup.set(normalized, toolId);
      }
    });
    return lookup;
  }, [hotkeys]);

  const setCaptureActive = useCallback((active: boolean) => {
    setCaptureActiveState(prev => (prev === active ? prev : active));
  }, []);

  const getShortcutForTool = useCallback(
    (toolId: string) => hotkeys[toolId],
    [hotkeys]
  );

  const formatShortcut = useCallback(
    (shortcut: string) => formatShortcutParts(shortcut, isMac),
    [isMac]
  );

  const isShortcutAvailable = useCallback(
    (shortcut: string, excludeToolId?: string) => {
      const normalized = normalizeShortcutString(shortcut);
      if (!normalized) return false;
      const assignedTool = shortcutLookup.get(normalized);
      return !assignedTool || assignedTool === excludeToolId;
    },
    [shortcutLookup]
  );

  const updateHotkey = useCallback(
    (toolId: string, shortcut: string) => {
      const normalized = normalizeShortcutString(shortcut);
      if (!normalized) return;

      setCustomHotkeys(prev => {
        const defaultValue = defaultHotkeys[toolId];
        if (defaultValue === normalized) {
          if (!(toolId in prev)) return prev;
          const { [toolId]: _removed, ...rest } = prev;
          return rest;
        }
        if (prev[toolId] === normalized) return prev;
        return { ...prev, [toolId]: normalized };
      });
    },
    [defaultHotkeys]
  );

  const resetHotkey = useCallback((toolId: string) => {
    setCustomHotkeys(prev => {
      if (!(toolId in prev)) return prev;
      const { [toolId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const resetAllHotkeys = useCallback(() => {
    setCustomHotkeys({});
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (captureActiveRef.current) return;
      if (isEditableElement(event.target)) return;

      const { shortcut } = captureShortcut(event);
      if (!shortcut) return;
      const normalized = normalizeShortcutString(shortcut);
      if (!normalized) return;

      const toolId = shortcutLookup.get(normalized);
      if (!toolId) return;

      const tool = registry[toolId];
      if (!tool) return;

      event.preventDefault();
      event.stopPropagation();

      if (tool.link) {
        window.open(tool.link, '_blank', 'noopener,noreferrer');
        return;
      }

      if (isValidToolId(toolId)) {
        handleToolSelect(toolId as ToolId);
      }
    },
    [handleToolSelect, registry, shortcutLookup]
  );

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, [handleKeyDown]);

  const contextValue = useMemo<HotkeyContextValue>(() => ({
    hotkeys,
    defaultHotkeys,
    customHotkeys,
    getShortcutForTool,
    formatShortcut,
    updateHotkey,
    resetHotkey,
    resetAllHotkeys,
    isShortcutAvailable,
    setCaptureActive,
    platform: isMac ? 'mac' : 'windows',
  }), [
    hotkeys,
    defaultHotkeys,
    customHotkeys,
    getShortcutForTool,
    formatShortcut,
    updateHotkey,
    resetHotkey,
    resetAllHotkeys,
    isShortcutAvailable,
    setCaptureActive,
    isMac,
  ]);

  return <HotkeyContext.Provider value={contextValue}>{children}</HotkeyContext.Provider>;
}

export function useHotkeys(): HotkeyContextValue {
  const context = useContext(HotkeyContext);
  if (!context) {
    throw new Error('useHotkeys must be used within a HotkeyProvider');
  }
  return context;
}
