import { Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useTheme } from "@app/components/shared/ThemeProvider";
import LanguageSelector from "@app/components/shared/LanguageSelector";
import { type ThemeMode } from "@app/constants/theme";

/** How the app looks: theme and display language. Both write through at once. */
export function AppearanceCard() {
  const { t } = useTranslation();
  const { setTheme, themeMode } = useTheme();

  return (
    <>
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div
            id="setting-theme"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text fw={500} size="sm">
                {t("settings.general.theme", "Theme")}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.general.themeDescription",
                  "Choose light, dark, or follow your system so it switches automatically.",
                )}
              </Text>
            </div>
            <SegmentedControl
              value={themeMode}
              onChange={(val) => setTheme(val as ThemeMode)}
              options={[
                {
                  label: t("settings.general.themeLight", "Light"),
                  value: "light",
                },
                {
                  label: t("settings.general.themeDark", "Dark"),
                  value: "dark",
                },
                {
                  label: t("settings.general.themeSystem", "System"),
                  value: "system",
                },
              ]}
            />
          </div>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <div
          id="setting-language"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t("settings.general.language", "Language")}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "settings.general.languageDescription",
                "Choose the display language",
              )}
            </Text>
          </div>
          <LanguageSelector position="bottom-end" offset={6} />
        </div>
      </Paper>
    </>
  );
}
