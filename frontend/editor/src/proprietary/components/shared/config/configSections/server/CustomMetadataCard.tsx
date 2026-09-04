import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { TextInput, Switch, Stack, Paper, Text, Group } from "@mantine/core";
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "admin.settings.general.customMetadata.autoUpdate.label",
                "Auto Update Metadata",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.general.customMetadata.autoUpdate.description",
                  "Automatically update PDF metadata on all processed documents",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings.customMetadata?.autoUpdateMetadata || false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  customMetadata: {
                    ...settings.customMetadata,
                    autoUpdateMetadata: e.target.checked,
                  },
                })
              }
              disabled={!loginEnabled}
            />
            <PendingBadge
              show={isFieldPending("customMetadata.autoUpdateMetadata")}
            />
          </Group>
        </div>

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
