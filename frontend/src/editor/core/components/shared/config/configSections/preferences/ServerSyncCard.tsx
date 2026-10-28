import { useId } from "react";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { Paper, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@editor/contexts/PreferencesContext";

/** Per-browser switch for pushing edits to server files automatically. */
export function ServerSyncCard() {
  const { t } = useTranslation();
  const labelId = `${useId()}-auto-sync-server-files`;
  const { preferences, updatePreference } = usePreferences();

  return (
    <Paper withBorder p="md" radius="md">
      <div
        id="setting-auto-sync-server-files"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text id={labelId} fw={500} size="sm">
            {t(
              "settings.serverSync.autoSync",
              "Sync changes to server files automatically",
            )}{" "}
            <InfoTooltip
              label={t(
                "settings.serverSync.autoSyncTooltip",
                "Edits to files you have uploaded to the server are saved there in the background, so you can continue on another device. If the server copy was changed elsewhere in the meantime, your edits stay here and you are asked before anything is replaced.",
              )}
            />
          </Text>
        </div>
        <Switch
          aria-labelledby={labelId}
          checked={preferences.autoSyncServerFiles}
          onChange={(event) =>
            updatePreference("autoSyncServerFiles", event.currentTarget.checked)
          }
        />
      </div>
    </Paper>
  );
}
