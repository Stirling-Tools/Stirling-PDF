import { useEffect, useId, useState } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import {
  NumberInput,
  Paper,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@app/contexts/PreferencesContext";

const DEFAULT_AUTO_UNZIP_FILE_LIMIT = 4;

/** What happens to ZIPs the API hands back. Automations are unaffected. */
export function DownloadsCard() {
  const { t } = useTranslation();
  // Each setting is a row of label text next to a bare control, so the controls
  // are named by pointing at that text rather than by a <label> association.
  const labelIds = useId();
  const autoUnzipLabelId = `${labelIds}-auto-unzip`;
  const autoUnzipLimitLabelId = `${labelIds}-auto-unzip-limit`;
  const { preferences, updatePreference } = usePreferences();
  const [fileLimitInput, setFileLimitInput] = useState<number | string>(
    preferences.autoUnzipFileLimit,
  );

  // Sync local state with preference changes
  useEffect(() => {
    setFileLimitInput(preferences.autoUnzipFileLimit);
  }, [preferences.autoUnzipFileLimit]);

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Tooltip
          label={t(
            "settings.general.autoUnzipTooltip",
            "Automatically extract ZIP files returned from API operations. Disable to keep ZIP files intact. This does not affect automation workflows.",
          )}
          multiline
          w={300}
          withArrow
        >
          <div
            id="setting-auto-unzip"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "help",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text id={autoUnzipLabelId} fw={500} size="sm">
                {t("settings.general.autoUnzip", "Auto-unzip API responses")}{" "}
                <InfoTooltip
                  label={t(
                    "settings.general.autoUnzipDescription",
                    "Automatically extract files from ZIP responses",
                  )}
                />
              </Text>
            </div>
            <Switch
              aria-labelledby={autoUnzipLabelId}
              checked={preferences.autoUnzip}
              onChange={(event) =>
                updatePreference("autoUnzip", event.currentTarget.checked)
              }
            />
          </div>
        </Tooltip>

        <Tooltip
          label={t(
            "settings.general.autoUnzipFileLimitTooltip",
            "Only unzip if the ZIP contains this many files or fewer. Set higher to extract larger ZIPs.",
          )}
          multiline
          w={300}
          withArrow
        >
          <div
            id="setting-auto-unzip-file-limit"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "help",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text id={autoUnzipLimitLabelId} fw={500} size="sm">
                {t(
                  "settings.general.autoUnzipFileLimit",
                  "Auto-unzip file limit",
                )}{" "}
                <InfoTooltip
                  label={t(
                    "settings.general.autoUnzipFileLimitDescription",
                    "Maximum number of files to extract from ZIP",
                  )}
                />
              </Text>
            </div>
            <NumberInput
              aria-labelledby={autoUnzipLimitLabelId}
              value={fileLimitInput}
              onChange={setFileLimitInput}
              onBlur={() => {
                const numValue = Number(fileLimitInput);
                const finalValue =
                  !fileLimitInput ||
                  isNaN(numValue) ||
                  numValue < 1 ||
                  numValue > 100
                    ? DEFAULT_AUTO_UNZIP_FILE_LIMIT
                    : numValue;
                setFileLimitInput(finalValue);
                updatePreference("autoUnzipFileLimit", finalValue);
              }}
              min={1}
              max={100}
              step={1}
              disabled={!preferences.autoUnzip}
              style={{ width: 90 }}
            />
          </div>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
