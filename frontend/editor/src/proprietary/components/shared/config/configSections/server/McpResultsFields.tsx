import { useTranslation } from "react-i18next";
import { Group, Select, Textarea } from "@mantine/core";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";
import type { McpSettingsData } from "@app/components/shared/config/configSections/server/serverSettings";

interface McpResultsFieldsProps {
  settings: McpSettingsData;
  onChange: (patch: Partial<McpSettingsData>) => void;
  isFieldPending: (field: string) => boolean;
  parseList: (raw: string) => string[];
}

/** Where chat apps may send attachments from, and how results come back. */
export function McpResultsFields({
  settings,
  onChange,
  isFieldPending,
  parseList,
}: McpResultsFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <Textarea
        label={
          <Group gap="xs">
            <span>
              {t("admin.settings.mcp.fileUrlHosts.label", "Attachment hosts")}
            </span>
            <PendingBadge show={isFieldPending("fileUrlAllowedHosts")} />
            <InfoTooltip
              label={t(
                "admin.settings.mcp.fileUrlHosts.description",
                "HTTPS hosts chat apps may pass file download URLs from (comma or space separated). Suffix match, * within one label, or * alone for any public host. Private addresses are always blocked. Empty turns attachments off.",
              )}
            />
          </Group>
        }
        value={(settings.fileUrlAllowedHosts || []).join(" ")}
        onChange={(e) =>
          onChange({ fileUrlAllowedHosts: parseList(e.target.value) })
        }
        placeholder="oaiusercontent.com chatgpt.com"
        autosize
        minRows={1}
        maxRows={3}
        disabled={!settings.enabled}
      />
      <Select
        label={
          <Group gap="xs">
            <span>
              {t("admin.settings.mcp.downloadLinks.label", "Result links")}
            </span>
            <PendingBadge show={isFieldPending("downloadLinks")} />
            <InfoTooltip
              label={t(
                "admin.settings.mcp.downloadLinks.description",
                "Download links on tool results. Private links need the user to sign in; public links work for anyone holding them until they expire.",
              )}
            />
          </Group>
        }
        data={[
          {
            value: "private",
            label: t(
              "admin.settings.mcp.downloadLinks.private",
              "Private (sign-in required)",
            ),
          },
          {
            value: "public",
            label: t(
              "admin.settings.mcp.downloadLinks.public",
              "Public (anyone with the link)",
            ),
          },
          {
            value: "off",
            label: t("admin.settings.mcp.downloadLinks.off", "Off"),
          },
        ]}
        value={settings.downloadLinks || "private"}
        onChange={(v) => onChange({ downloadLinks: v || "private" })}
        allowDeselect={false}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_OVER_CONFIG_MODAL,
        }}
        disabled={!settings.enabled}
      />
    </>
  );
}
