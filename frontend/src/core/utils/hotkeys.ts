import { KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface HotkeyBinding {
  code: string;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

const CODE_LABEL_MAP: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'Esc',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  NumpadComma: 'Num ,',
  NumpadEqual: 'Num =',
};

export const isMacLike = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const platform = navigator.platform?.toLowerCase() ?? '';
  const userAgent = navigator.userAgent?.toLowerCase() ?? '';
  return /mac|iphone|ipad|ipod/.test(platform) || /mac|iphone|ipad|ipod/.test(userAgent);
};

export const isModifierCode = (code: string): boolean => MODIFIER_CODES.has(code);

const isFunctionKey = (code: string): boolean => /^F\d{1,2}$/.test(code);

export const bindingEquals = (a?: HotkeyBinding | null, b?: HotkeyBinding | null): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.code === b.code &&
    Boolean(a.alt) === Boolean(b.alt) &&
    Boolean(a.ctrl) === Boolean(b.ctrl) &&
    Boolean(a.meta) === Boolean(b.meta) &&
    Boolean(a.shift) === Boolean(b.shift)
  );
};

export const bindingMatchesEvent = (binding: HotkeyBinding, event: KeyboardEvent): boolean => {
  return (
    event.code === binding.code &&
    event.altKey === Boolean(binding.alt) &&
    event.ctrlKey === Boolean(binding.ctrl) &&
    event.metaKey === Boolean(binding.meta) &&
    event.shiftKey === Boolean(binding.shift)
  );
};

export const eventToBinding = (event: KeyboardEvent | ReactKeyboardEvent): HotkeyBinding | null => {
  const code = event.code;
  if (!code || isModifierCode(code)) {
    return null;
  }

  const binding: HotkeyBinding = {
    code,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
  };

  // Require at least one modifier to avoid clashing with text input
  if (!binding.alt && !binding.ctrl && !binding.meta) {
    return null;
  }

  return binding;
};

const getKeyLabel = (code: string): string => {
  if (CODE_LABEL_MAP[code]) {
    return CODE_LABEL_MAP[code];
  }

  if (code.startsWith('Key')) {
    return code.slice(3);
  }

  if (code.startsWith('Digit')) {
    return code.slice(5);
  }

  if (code.startsWith('Numpad')) {
    const remainder = code.slice(6);
    if (/^[0-9]$/.test(remainder)) {
      return `Num ${remainder}`;
    }
    return `Num ${remainder}`;
  }

  // Match function keys (F1-F12)
  if (isFunctionKey(code)) {
    return code;
  }

  switch (code) {
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    default:
      return code;
  }
};

export const getDisplayParts = (binding: HotkeyBinding | null | undefined, macLike: boolean): string[] => {
  if (!binding) return [];
  const parts: string[] = [];
  if (binding.meta) {
    parts.push(macLike ? '⌘' : 'Win');
  }
  if (binding.ctrl) {
    parts.push(macLike ? '⌃' : 'Ctrl');
  }
  if (binding.alt) {
    parts.push(macLike ? '⌥' : 'Alt');
  }
  if (binding.shift) {
    parts.push(macLike ? '⇧' : 'Shift');
  }
  parts.push(getKeyLabel(binding.code));
  return parts;
};

export const serializeBindings = (bindings: Record<string, HotkeyBinding>): string => {
  return JSON.stringify(bindings);
};

export const deserializeBindings = (value: string | null | undefined): Record<string, HotkeyBinding> => {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as Record<string, HotkeyBinding>;
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse stored hotkey bindings', error);
    return {};
  }
};

export const normalizeBinding = (binding: HotkeyBinding): HotkeyBinding => ({
  code: binding.code,
  alt: Boolean(binding.alt),
  ctrl: Boolean(binding.ctrl),
  meta: Boolean(binding.meta),
  shift: Boolean(binding.shift),
});