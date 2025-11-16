export const LOCAL_SETTINGS_EVENT = 'stirlingpdf:local-settings-changed';

export type LocalSettingsEventOrigin = 'local' | 'remote';

export interface LocalSettingsEventDetail {
  keys: string[];
  origin: LocalSettingsEventOrigin;
}

export function emitLocalSettingsEvent(keys: string[], origin: LocalSettingsEventOrigin) {
  if (typeof window === 'undefined') {
    return;
  }

  const uniqueKeys = Array.from(new Set(keys)).filter(Boolean);
  if (uniqueKeys.length === 0) {
    return;
  }

  const event = new CustomEvent<LocalSettingsEventDetail>(LOCAL_SETTINGS_EVENT, {
    detail: {
      keys: uniqueKeys,
      origin,
    },
  });

  window.dispatchEvent(event);
}

export function addLocalSettingsListener(
  listener: (detail: LocalSettingsEventDetail) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<LocalSettingsEventDetail>;
    if (customEvent?.detail) {
      listener(customEvent.detail);
    }
  };

  window.addEventListener(LOCAL_SETTINGS_EVENT, handler as EventListener);
  return () => window.removeEventListener(LOCAL_SETTINGS_EVENT, handler as EventListener);
}
