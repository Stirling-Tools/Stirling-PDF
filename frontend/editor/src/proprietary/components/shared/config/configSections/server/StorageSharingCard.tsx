import { useTranslation } from "react-i18next";
import { Anchor, Paper, Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import type { StorageSharingCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";

/**
 * Server-side file storage and what may be shared from it. The Frontend URL it
 * gates Share Links on is the System card's field, one draft over; the page
 * refetches this section after any save so filling that field in unlocks it.
 */
export function StorageSharingCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: StorageSharingCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getDisabledStyles } = useLoginRequired();

  const storageEnabled = settings.enabled ?? false;
  const sharingEnabled = storageEnabled && (settings.sharing?.enabled ?? false);
  const frontendUrlConfigured = Boolean(settings.system?.frontendUrl?.trim());
  const mailEnabled = Boolean(settings.mail?.enabled);

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <SettingsToggleRow
          label={t(
            "admin.settings.storage.enabled.label",
            "Enable Server File Storage",
          )}
          info={t(
            "admin.settings.storage.enabled.description",
            "Allow users to store files on the server.",
          )}
          pending={isFieldPending("enabled")}
          checked={storageEnabled}
          onChange={(checked) => setSettings({ ...settings, enabled: checked })}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.storage.sharing.enabled.label",
            "Enable Sharing",
          )}
          info={t(
            "admin.settings.storage.sharing.enabled.description",
            "Allow users to share stored files.",
          )}
          pending={isFieldPending("sharing.enabled")}
          checked={settings.sharing?.enabled ?? false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              sharing: { ...settings.sharing, enabled: checked },
            })
          }
          disabled={!loginEnabled || !storageEnabled}
          styles={getDisabledStyles()}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.storage.sharing.links.label",
            "Enable Share Links",
          )}
          info={t(
            "admin.settings.storage.sharing.links.description",
            "Allow sharing via signed-in links.",
          )}
          pending={isFieldPending("sharing.linkEnabled")}
          note={
            !frontendUrlConfigured && (
              <>
                {t(
                  "admin.settings.storage.sharing.links.frontendUrlNote",
                  "Requires a Frontend URL. ",
                )}
                <Anchor
                  href="#frontendUrl"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("frontendUrl")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  inherit
                  td="underline"
                >
                  {t(
                    "admin.settings.storage.sharing.links.frontendUrlLink",
                    "Configure in System Settings",
                  )}
                </Anchor>
              </>
            )
          }
          checked={settings.sharing?.linkEnabled ?? false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              sharing: { ...settings.sharing, linkEnabled: checked },
            })
          }
          disabled={!loginEnabled || !sharingEnabled || !frontendUrlConfigured}
          styles={getDisabledStyles()}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.storage.sharing.email.label",
            "Enable Email Sharing",
          )}
          info={t(
            "admin.settings.storage.sharing.email.description",
            "Allow sharing with email addresses.",
          )}
          pending={isFieldPending("sharing.emailEnabled")}
          note={
            !mailEnabled && (
              <>
                {t(
                  "admin.settings.storage.sharing.email.mailNote",
                  "Requires mail configuration. ",
                )}
                <Anchor
                  href="#adminConnections"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(
                      "/settings/adminConnections?focus=adminConnections",
                    );
                  }}
                  inherit
                  td="underline"
                >
                  {t(
                    "admin.settings.storage.sharing.email.mailLink",
                    "Configure Mail Settings",
                  )}
                </Anchor>
              </>
            )
          }
          checked={settings.sharing?.emailEnabled ?? false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              sharing: { ...settings.sharing, emailEnabled: checked },
            })
          }
          disabled={!loginEnabled || !sharingEnabled || !mailEnabled}
          styles={getDisabledStyles()}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.storage.signing.enabled.label",
            "Enable Group Signing",
          )}
          info={t(
            "admin.settings.storage.signing.enabled.description",
            "Allow users to create multi-participant document signing sessions. Requires server file storage to be enabled.",
          )}
          pending={isFieldPending("signing.enabled")}
          checked={settings.signing?.enabled ?? false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              signing: { ...settings.signing, enabled: checked },
            })
          }
          disabled={!loginEnabled || !storageEnabled}
          styles={getDisabledStyles()}
        />
      </Stack>
    </Paper>
  );
}
