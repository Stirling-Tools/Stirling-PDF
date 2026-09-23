import { useTranslation } from "react-i18next";
import { Stack, Paper, Divider } from "@mantine/core";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import LoginAgreementEditor from "@app/components/shared/config/configSections/LoginAgreementEditor";
import type { LegalCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/** The disclaimer users accept after signing in, and its per-language text. */
export function LoginAgreementCard({
  settings,
  setSettings,
  loginEnabled,
}: LegalCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <SettingsToggleRow
          label={t(
            "admin.settings.legal.loginAgreement.enabled.label",
            "Enable login agreement",
          )}
          info={t(
            "admin.settings.legal.loginAgreement.restartNote",
            "Enabling or disabling the agreement applies after a restart, like other settings. Text edits below apply immediately.",
          )}
          checked={settings.loginAgreement?.enabled ?? false}
          onChange={(checked) =>
            setSettings({
              ...settings,
              loginAgreement: {
                ...settings.loginAgreement,
                enabled: checked,
              },
            })
          }
          disabled={!loginEnabled}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.legal.loginAgreement.anonymous.label",
            "Show in anonymous (no-login) mode",
          )}
          checked={settings.loginAgreement?.showInAnonymousMode ?? true}
          onChange={(checked) =>
            setSettings({
              ...settings,
              loginAgreement: {
                ...settings.loginAgreement,
                showInAnonymousMode: checked,
              },
            })
          }
          disabled={!loginEnabled}
        />

        <Divider />

        <LoginAgreementEditor disabled={!loginEnabled} />
      </Stack>
    </Paper>
  );
}
