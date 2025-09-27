import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useToolWorkflow } from './ToolWorkflowContext';
import { ToolId, isValidToolId } from '../types/toolId';
import { ToolRegistryEntry } from '../data/toolsTaxonomy';

type HotkeyMap = Record<string, Hotkey>;

export interface Hotkey {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

interface HotkeysContextValue {
  hotkeys: HotkeyMap;
  defaultHotkeys: HotkeyMap;
  getHotkey: (toolId: string) => Hotkey | undefined;
  formatHotkey: (hotkey?: Hotkey) => string;
  formatHotkeyParts: (hotkey?: Hotkey) => string[];
  setHotkey: (toolId: string, hotkey: Hotkey) => void;
  resetHotkey: (toolId: string) => void;
  resetAllHotkeys: () => void;
  isHotkeyInUse: (hotkey: Hotkey, excludeToolId?: string) => boolean;
  suspendHotkeys: (suspended: boolean) => void;
  isSuspended: boolean;
  isMac: boolean;
  createHotkeyFromEvent: (event: KeyboardEvent) => Hotkey;
}

const HotkeysContext = createContext<HotkeysContextValue | undefined>(undefined);

const STORAGE_KEY = 'stirling-pdf.hotkeys';

const FALLBACK_CODE_POOL: string[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => `Key${letter}`),
  ...'0123456789'.split('').map(num => `Digit${num}`),
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
  'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash'
];

const SPECIAL_CHAR_TO_CODE: Record<string, string> = {
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backquote',
};

const CODE_TO_LABEL: Record<string, string> = {
  Space: 'Space',
  Escape: 'Esc',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Del',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  IntlBackslash: '\\',
};

const isMacPlatform = () => {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
};

const serializeHotkey = (hotkey: Hotkey): string => {
  const parts: string[] = [];
  if (hotkey.metaKey) parts.push('Meta');
  if (hotkey.ctrlKey) parts.push('Ctrl');
  if (hotkey.altKey) parts.push('Alt');
  if (hotkey.shiftKey) parts.push('Shift');
  parts.push(hotkey.code);
  return parts.join('+');
};

const charToCode = (char: string): string | null => {
  if (!char) return null;
  if (/^[A-Z]$/.test(char)) return `Key${char}`;
  if (/^[0-9]$/.test(char)) return `Digit${char}`;
  return SPECIAL_CHAR_TO_CODE[char] || null;
};

const getKeyLabelFromCode = (code: string): string => {
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  if (/^F\d{1,2}$/.test(code)) {
    return code;
  }
  return CODE_TO_LABEL[code] || code;
};

const buildHotkey = (code: string, isMac: boolean, withShift = false): Hotkey => ({
  code,
  altKey: true,
  ctrlKey: !isMac,
  metaKey: isMac,
  shiftKey: withShift,
});

const generateCandidateCodes = (toolId: string, tool: ToolRegistryEntry): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (code: string | null | undefined) => {
    if (!code) return;
    if (seen.has(code)) return;
    seen.add(code);
    result.push(code);
  };

  const addFromText = (text: string | undefined | null) => {
    if (!text) return;
    text
      .split(/[^A-Za-z0-9]+/)
      .map(token => token.trim())
      .filter(Boolean)
      .forEach(token => add(charToCode(token[0]!.toUpperCase())));
  };

  addFromText(tool.name);
  addFromText(toolId.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));

  if (tool.synonyms) {
    tool.synonyms.forEach(synonym => addFromText(synonym));
  }

  toolId
    .replace(/[^A-Za-z0-9\-_=\[\]\\;',\.\/`]/g, '')
    .toUpperCase()
    .split('')
    .forEach(character => add(charToCode(character)));

  FALLBACK_CODE_POOL.forEach(code => add(code));

  return result;
};

const allocateHotkey = (
  toolId: string,
  tool: ToolRegistryEntry,
  used: Set<string>,
  isMac: boolean,
  preferred?: Hotkey
): Hotkey => {
  if (preferred) {
    const serialized = serializeHotkey(preferred);
    if (!used.has(serialized)) {
      return preferred;
    }
  }

  const candidateCodes = generateCandidateCodes(toolId, tool);

  for (const code of candidateCodes) {
    const candidate = buildHotkey(code, isMac, false);
    if (!used.has(serializeHotkey(candidate))) {
      return candidate;
    }
  }

  for (const code of candidateCodes) {
    const candidate = buildHotkey(code, isMac, true);
    if (!used.has(serializeHotkey(candidate))) {
      return candidate;
    }
  }

  // Final fallback - generate synthetic function keys beyond F24 if somehow needed
  let counter = 25;
  while (true) {
    const code = `F${counter}`;
    const candidate = buildHotkey(code, isMac, true);
    const serialized = serializeHotkey(candidate);
    if (!used.has(serialized)) {
      return candidate;
    }
    counter += 1;
    if (counter > 64) {
      // Hard stop to prevent infinite loop
      return buildHotkey('F64', isMac, true);
    }
  }
};

const computeDefaultHotkeys = (
  toolEntries: Array<[string, ToolRegistryEntry]>,
  isMac: boolean
): HotkeyMap => {
  const used = new Set<string>();
  const defaults: HotkeyMap = {};
  const sortedEntries = [...toolEntries].sort((a, b) => a[1].name.localeCompare(b[1].name, undefined, { sensitivity: 'base' }));

  sortedEntries.forEach(([toolId, tool]) => {
    const hotkey = allocateHotkey(toolId, tool, used, isMac);
    defaults[toolId] = hotkey;
    used.add(serializeHotkey(hotkey));
  });

  return defaults;
};

const loadStoredHotkeys = (): HotkeyMap => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const entries = Object.entries(parsed) as Array<[string, Hotkey]>;
    const sanitized: HotkeyMap = {};
    entries.forEach(([toolId, combo]) => {
      if (
        combo &&
        typeof combo.code === 'string' &&
        typeof combo.altKey === 'boolean' &&
        typeof combo.ctrlKey === 'boolean' &&
        typeof combo.metaKey === 'boolean' &&
        typeof combo.shiftKey === 'boolean'
      ) {
        sanitized[toolId] = combo;
      }
    });
    return sanitized;
  } catch (err) {
    console.warn('Failed to parse stored hotkeys:', err);
    return {};
  }
};

const saveHotkeysToStorage = (hotkeys: HotkeyMap) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hotkeys));
  } catch (err) {
    console.warn('Failed to persist hotkeys:', err);
  }
};

const matchesEvent = (event: KeyboardEvent, hotkey: Hotkey): boolean => {
  return (
    event.code === hotkey.code &&
    event.altKey === hotkey.altKey &&
    event.ctrlKey === hotkey.ctrlKey &&
    event.metaKey === hotkey.metaKey &&
    event.shiftKey === hotkey.shiftKey
  );
};

const shouldIgnoreEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  const editableTags = ['INPUT', 'TEXTAREA', 'SELECT'];
  if (editableTags.includes(tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
};

export const HotkeysProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toolRegistry, handleToolSelect } = useToolWorkflow();
  const isMac = useMemo(() => isMacPlatform(), []);
  const toolEntries = useMemo(() => Object.entries(toolRegistry || {}) as Array<[string, ToolRegistryEntry]>, [toolRegistry]);
  const toolMap = useMemo(() => Object.fromEntries(toolEntries), [toolEntries]);

  const [storedHotkeys] = useState<HotkeyMap>(() => loadStoredHotkeys());
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(storedHotkeys);
  const [isSuspended, setIsSuspended] = useState(false);

  const defaultHotkeys = useMemo(() => computeDefaultHotkeys(toolEntries, isMac), [toolEntries, isMac]);

  // Ensure every tool has a hotkey and remove those that no longer exist
  useEffect(() => {
    if (toolEntries.length === 0) return;

    setHotkeys(prev => {
      const used = new Set<string>();
      const next: HotkeyMap = {};
      let changed = false;

      Object.entries(prev).forEach(([toolId, combo]) => {
        if (defaultHotkeys[toolId]) {
          next[toolId] = combo;
          used.add(serializeHotkey(combo));
        } else {
          changed = true;
        }
      });

      toolEntries.forEach(([toolId, tool]) => {
        if (!next[toolId]) {
          const preferred = defaultHotkeys[toolId];
          const resolved = allocateHotkey(toolId, tool, used, isMac, preferred);
          next[toolId] = resolved;
          used.add(serializeHotkey(resolved));
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [toolEntries, defaultHotkeys, isMac]);

  // Persist hotkeys when they change and tools are loaded
  useEffect(() => {
    if (toolEntries.length === 0) return;
    saveHotkeysToStorage(hotkeys);
  }, [hotkeys, toolEntries.length]);

  const getHotkey = useCallback((toolId: string) => hotkeys[toolId], [hotkeys]);

  const formatHotkeyParts = useCallback((hotkey?: Hotkey) => {
    if (!hotkey) return [];
    const parts: string[] = [];
    if (hotkey.metaKey) parts.push(isMac ? '⌘' : 'Win');
    if (hotkey.ctrlKey) parts.push(isMac ? '⌃' : 'Ctrl');
    if (hotkey.altKey) parts.push(isMac ? '⌥' : 'Alt');
    if (hotkey.shiftKey) parts.push(isMac ? '⇧' : 'Shift');
    parts.push(getKeyLabelFromCode(hotkey.code));
    return parts;
  }, [isMac]);

  const formatHotkey = useCallback((hotkey?: Hotkey) => formatHotkeyParts(hotkey).join(' + '), [formatHotkeyParts]);

  const cloneHotkey = useCallback((hotkey: Hotkey): Hotkey => ({
    code: hotkey.code,
    altKey: hotkey.altKey,
    ctrlKey: hotkey.ctrlKey,
    metaKey: hotkey.metaKey,
    shiftKey: hotkey.shiftKey,
  }), []);

  const setHotkey = useCallback((toolId: string, hotkey: Hotkey) => {
    setHotkeys(prev => ({ ...prev, [toolId]: cloneHotkey(hotkey) }));
  }, [cloneHotkey]);

  const resetHotkey = useCallback((toolId: string) => {
    const fallback = defaultHotkeys[toolId];
    if (!fallback) return;
    setHotkeys(prev => ({ ...prev, [toolId]: cloneHotkey(fallback) }));
  }, [defaultHotkeys, cloneHotkey]);

  const resetAllHotkeys = useCallback(() => {
    setHotkeys(() => {
      const next: HotkeyMap = {};
      Object.entries(defaultHotkeys).forEach(([toolId, combo]) => {
        next[toolId] = cloneHotkey(combo);
      });
      return next;
    });
  }, [defaultHotkeys, cloneHotkey]);

  const isHotkeyInUse = useCallback((hotkey: Hotkey, excludeToolId?: string) => {
    const serialized = serializeHotkey(hotkey);
    return Object.entries(hotkeys).some(([toolId, combo]) => {
      if (excludeToolId && toolId === excludeToolId) return false;
      return serializeHotkey(combo) === serialized;
    });
  }, [hotkeys]);

  const suspendHotkeys = useCallback((suspended: boolean) => {
    setIsSuspended(suspended);
  }, []);

  const createHotkeyFromEvent = useCallback((event: KeyboardEvent): Hotkey => ({
    code: event.code,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  }), []);

  useEffect(() => {
    if (toolEntries.length === 0) return;

    const handler = (event: KeyboardEvent) => {
      if (isSuspended) return;
      if (event.repeat) return;
      if (shouldIgnoreEventTarget(event.target)) return;

      const matchEntry = Object.entries(hotkeys).find(([, combo]) => matchesEvent(event, combo));
      if (!matchEntry) return;

      const [toolId] = matchEntry;
      const tool = toolMap[toolId];
      if (!tool) return;

      const isUnavailable = !tool.component && !tool.link && toolId !== 'read' && toolId !== 'multiTool';
      if (isUnavailable) return;

      event.preventDefault();
      event.stopPropagation();

      if (tool.link) {
        window.open(tool.link, '_blank', 'noopener,noreferrer');
        return;
      }

      if (isValidToolId(toolId)) {
        handleToolSelect(toolId as ToolId);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkeys, isSuspended, toolEntries.length, handleToolSelect, toolMap]);

  const value = useMemo<HotkeysContextValue>(() => ({
    hotkeys,
    defaultHotkeys,
    getHotkey,
    formatHotkey,
    formatHotkeyParts,
    setHotkey,
    resetHotkey,
    resetAllHotkeys,
    isHotkeyInUse,
    suspendHotkeys,
    isSuspended,
    isMac,
    createHotkeyFromEvent,
  }), [
    hotkeys,
    defaultHotkeys,
    getHotkey,
    formatHotkey,
    formatHotkeyParts,
    setHotkey,
    resetHotkey,
    resetAllHotkeys,
    isHotkeyInUse,
    suspendHotkeys,
    isSuspended,
    isMac,
    createHotkeyFromEvent,
  ]);

  return <HotkeysContext.Provider value={value}>{children}</HotkeysContext.Provider>;
};

export const useHotkeysContext = (): HotkeysContextValue => {
  const context = useContext(HotkeysContext);
  if (!context) {
    throw new Error('useHotkeysContext must be used within a HotkeysProvider');
  }
  return context;
};

