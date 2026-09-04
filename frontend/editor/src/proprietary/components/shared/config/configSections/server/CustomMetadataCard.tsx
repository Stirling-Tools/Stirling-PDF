import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { TextInput, Stack, Paper, Group } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import type { GeneralCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";

/** Metadata stamped onto every processed document. Saved under premium.proFeatures. */
export function CustomMetadataCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: GeneralCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <SettingsToggleRow
          label={t(
            "admin.settings.general.customMetadata.autoUpdate.label",
            "Auto Update Metadata",
          )}
          info={t(
            "admin.settings.general.customMetadata.autoUpdate.description",
            "Automatically update PDF metadata on all processed documents",
          )}
          pending={isFieldPending("customMetadata.autoUpdateMetadata")}
          checked={settings.customMetadata?.autoUpdateMetadata || false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              customMetadata: {
                ...settings.customMetadata,
                autoUpdateMetadata: checked,
              },
            })
          }
          disabled={!loginEnabled}
        />

        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.customMetadata.author.label",
                    "Default Author",
                  )}
                </span>
                <PendingBadge show={isFieldPending("customMetadata.author")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.general.customMetadata.author.description",
                    "Default author for PDF metadata (e.g., username)",
                  )}
                />
              </Group>
            }
            value={settings.customMetadata?.author || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customMetadata: {
                  ...settings.customMetadata,
                  author: e.target.value,
                },
              })
            }
            placeholder="username"
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.customMetadata.creator.label",
                    "Default Creator",
                  )}
                </span>
                <PendingBadge show={isFieldPending("customMetadata.creator")} />
                <InfoTooltip
                  label={t(
                    "admin.settings.general.customMetadata.creator.description",
                    "Default creator for PDF metadata",
                  )}
                />
              </Group>
            }
            value={settings.customMetadata?.creator || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customMetadata: {
                  ...settings.customMetadata,
                  creator: e.target.value,
                },
              })
            }
            placeholder="Stirling-PDF"
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <TextInput
            label={
              <Group gap="xs">
                <span>
                  {t(
                    "admin.settings.general.customMetadata.producer.label",
                    "Default Producer",
                  )}
                </span>
                <PendingBadge
                  show={isFieldPending("customMetadata.producer")}
                />
                <InfoTooltip
                  label={t(
                    "admin.settings.general.customMetadata.producer.description",
                    "Default producer for PDF metadata",
                  )}
                />
              </Group>
            }
            value={settings.customMetadata?.producer || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customMetadata: {
                  ...settings.customMetadata,
                  producer: e.target.value,
                },
              })
            }
            placeholder="Stirling-PDF"
            disabled={!loginEnabled}
          />
        </div>
      </Stack>
    </Paper>
  );
}
