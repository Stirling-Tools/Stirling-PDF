import { useCallback, useMemo } from "react";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import {
  DEFAULT_SAVE_MODE,
  parseSaveMode,
  type SaveMode,
} from "@editor/services/saveMode";

export interface SaveModeState {
  mode: SaveMode;
  /** The administrator applies one mode to everyone. */
  locked: boolean;
  setMode: (mode: SaveMode) => void;
}

export function useSaveMode(): SaveModeState {
  const { config } = useAppConfig();
  const { preferences, updatePreference } = usePreferences();
  const locked = config?.allowUserSaveMode === false;
  const serverMode = parseSaveMode(config?.saveMode) ?? DEFAULT_SAVE_MODE;
  const mode = locked
    ? serverMode
    : (parseSaveMode(preferences.saveMode) ?? serverMode);
  const setMode = useCallback(
    (next: SaveMode) => {
      if (!locked) updatePreference("saveMode", next);
    },
    [locked, updatePreference],
  );
  return useMemo(() => ({ mode, locked, setMode }), [mode, locked, setMode]);
}
