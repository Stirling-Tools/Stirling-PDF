import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@app/auth/UseSession';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { userSettingsService } from '@app/services/userSettingsService';
import { PREFERENCES_STORAGE_KEY } from '@app/services/preferencesService';
import { addLocalSettingsListener, emitLocalSettingsEvent } from '@app/utils/localSettingsEvents';
import i18n from '@app/i18n';

const LANGUAGE_STORAGE_KEY = 'i18nextLng';
const HOTKEY_STORAGE_KEY = 'stirlingpdf.hotkeys';
const FAVORITE_TOOLS_KEY = 'stirlingpdf.favoriteTools';

const SYNCABLE_KEYS = [
  PREFERENCES_STORAGE_KEY,
  LANGUAGE_STORAGE_KEY,
  HOTKEY_STORAGE_KEY,
  FAVORITE_TOOLS_KEY,
] as const;

const SYNCABLE_KEY_SET = new Set<string>(SYNCABLE_KEYS);

function collectLocalSettings(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  return SYNCABLE_KEYS.reduce<Record<string, string>>((acc, key) => {
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export function useUserSettingsSync() {
  const { session } = useAuth();
  const { preferences } = usePreferences();
  const syncEnabled = Boolean(session && preferences.syncSettingsAcrossDevices);
  const uploadTimeoutRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);

  const applyRemoteSettings = useCallback((settings?: Record<string, string>) => {
    if (!settings || typeof window === 'undefined') {
      return;
    }

    const appliedKeys: string[] = [];
    SYNCABLE_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        window.localStorage.setItem(key, settings[key]);
        appliedKeys.push(key);
      }
    });

    const remoteLanguage = settings[LANGUAGE_STORAGE_KEY];
    if (remoteLanguage && i18n.language !== remoteLanguage) {
      i18n.changeLanguage(remoteLanguage).catch(() => {
        // ignore change errors
      });
    }

    if (appliedKeys.length > 0) {
      emitLocalSettingsEvent(appliedKeys, 'remote');
    }
  }, []);

  const flushUpload = useCallback(async () => {
    if (!session || !syncEnabled || typeof window === 'undefined') {
      return;
    }

    try {
      const snapshot = collectLocalSettings();
      await userSettingsService.save(snapshot);
    } catch (error) {
      console.error('[UserSettingsSync] Failed to sync settings', error);
    }
  }, [session, syncEnabled]);

  const scheduleUpload = useCallback(() => {
    if (!session || !syncEnabled) {
      return;
    }

    if (uploadTimeoutRef.current) {
      window.clearTimeout(uploadTimeoutRef.current);
    }

    uploadTimeoutRef.current = window.setTimeout(() => {
      uploadTimeoutRef.current = null;
      flushUpload();
    }, 750);
  }, [session, syncEnabled, flushUpload]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    (async () => {
      if (isFetchingRef.current) {
        return;
      }
      isFetchingRef.current = true;
      try {
        const response = await userSettingsService.fetch();
        if (!cancelled) {
          applyRemoteSettings(response?.settings);
        }
      } catch (error) {
        console.error('[UserSettingsSync] Failed to load user settings', error);
      } finally {
        isFetchingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, applyRemoteSettings]);

  useEffect(() => {
    if (!session) {
      if (uploadTimeoutRef.current) {
        window.clearTimeout(uploadTimeoutRef.current);
        uploadTimeoutRef.current = null;
      }
      return;
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (syncEnabled) {
      flushUpload();
    } else if (uploadTimeoutRef.current) {
      window.clearTimeout(uploadTimeoutRef.current);
      uploadTimeoutRef.current = null;
    }
  }, [session, syncEnabled, flushUpload]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    return addLocalSettingsListener(detail => {
      if (detail.origin !== 'local') {
        return;
      }
      if (!session || !syncEnabled) {
        return;
      }
      const relevant = detail.keys.filter(key => SYNCABLE_KEY_SET.has(key));
      if (relevant.length === 0) {
        return;
      }
      scheduleUpload();
    });
  }, [session, syncEnabled, scheduleUpload]);
}
