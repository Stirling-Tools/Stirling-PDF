export type SupportedModifier = 'ctrl' | 'meta' | 'alt' | 'shift';

const MODIFIER_ORDER: SupportedModifier[] = ['ctrl', 'meta', 'alt', 'shift'];
const DISPLAY_ORDER: SupportedModifier[] = ['meta', 'ctrl', 'alt', 'shift'];

const MAC_SYMBOLS: Record<SupportedModifier, string> = {
  meta: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
};

const DEFAULT_SYMBOLS: Record<SupportedModifier, string> = {
  meta: 'Win',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
};

const SPECIAL_KEY_LABELS: Record<string, string> = {
  space: 'Space',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
};

export const KEY_SEQUENCE: string[] = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P',
  'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L',
  'Z', 'X', 'C', 'V', 'B', 'N', 'M',
  '[', ']', ';', "'", ',', '.', '/', '\\', '-', '=',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
];

export interface ShortcutCapture {
  shortcut: string | null;
  keyToken: string | null;
  modifiers: SupportedModifier[];
}

export function detectIsMac(): boolean {
  if (typeof window === 'undefined') return false;
  const platform = window.navigator?.userAgentData?.platform || window.navigator?.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function mapKeyToToken(key: string): string | null {
  if (!key) return null;
  const lower = key.toLowerCase();

  if (lower === ' ') return 'space';
  if (lower === 'escape') return 'escape';
  if (lower === 'tab') return 'tab';
  if (lower === 'enter') return 'enter';
  if (lower === 'backspace') return 'backspace';
  if (lower === 'delete') return 'delete';
  if (lower === 'insert') return 'insert';
  if (lower === 'home') return 'home';
  if (lower === 'end') return 'end';
  if (lower === 'pageup') return 'pageup';
  if (lower === 'pagedown') return 'pagedown';
  if (lower === 'arrowup' || lower === 'arrowdown' || lower === 'arrowleft' || lower === 'arrowright') {
    return lower;
  }

  if (/^f\d{1,2}$/i.test(key)) {
    return lower;
  }

  if (key.length === 1) {
    return lower;
  }

  return null;
}

function normalizeTokens(modifiers: SupportedModifier[], keyToken: string): string {
  const uniqueModifiers = Array.from(new Set(modifiers));
  uniqueModifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return [...uniqueModifiers, keyToken].join('+');
}

export function normalizeShortcutString(shortcut: string | null | undefined): string | null {
  if (!shortcut) return null;
  const parts = shortcut
    .split('+')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) return null;

  const modifiers: SupportedModifier[] = [];
  let keyToken: string | null = null;

  parts.forEach(part => {
    if ((MODIFIER_ORDER as string[]).includes(part)) {
      modifiers.push(part as SupportedModifier);
    } else if (!keyToken) {
      keyToken = part;
    }
  });

  if (!keyToken) return null;
  return normalizeTokens(modifiers, keyToken);
}

export function captureShortcut(event: KeyboardEvent): ShortcutCapture {
  const modifiers: SupportedModifier[] = [];
  if (event.ctrlKey) modifiers.push('ctrl');
  if (event.metaKey) modifiers.push('meta');
  if (event.altKey) modifiers.push('alt');
  if (event.shiftKey) modifiers.push('shift');

  const keyToken = mapKeyToToken(event.key);
  if (!keyToken) {
    return { shortcut: null, keyToken: null, modifiers };
  }

  if (modifiers.length === 0) {
    return { shortcut: null, keyToken, modifiers };
  }

  const shortcut = normalizeTokens(modifiers, keyToken);
  return { shortcut, keyToken, modifiers };
}

export function formatShortcutParts(shortcut: string, isMac: boolean): string[] {
  const normalized = normalizeShortcutString(shortcut);
  if (!normalized) return [];

  const parts = normalized.split('+');
  const keyToken = parts.pop();
  if (!keyToken) return [];

  const modifierSymbols = parts
    .map(part => part as SupportedModifier)
    .sort((a, b) => DISPLAY_ORDER.indexOf(a) - DISPLAY_ORDER.indexOf(b))
    .map(part => (isMac ? MAC_SYMBOLS[part] : DEFAULT_SYMBOLS[part]));

  const keyLabel = SPECIAL_KEY_LABELS[keyToken] || keyToken.toUpperCase();

  return [...modifierSymbols, keyLabel];
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return !!target.closest('[contenteditable="true"]');
}
