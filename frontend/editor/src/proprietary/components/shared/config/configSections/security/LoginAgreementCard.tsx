import { useTranslation } from "react-i18next";
import { Stack, Paper, Text, Switch, Divider } from "@mantine/core";
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
        <div>
          <Text size="sm" c="dimmed">
            {t(
              "admin.settings.legal.loginAgreement.description",
              "Show a disclaimer users must accept after logging in. The text follows each user's language.",
            )}
          </Text>
        </div>

        <Switch
          label={t(
            "admin.settings.legal.loginAgreement.enabled.label",
            "Enable login agreement",
          )}
          checked={settings.loginAgreement?.enabled ?? false}
          onChange={(e) =>
            setSettings({
              ...settings,
              loginAgreement: {
                ...settings.loginAgreement,
                enabled: e.currentTarget.checked,
              },
            })
          }
          disabled={!loginEnabled}
        />

        <Switch
          label={t(
            "admin.settings.legal.loginAgreement.anonymous.label",
            "Show in anonymous (no-login) mode",
          )}
          checked={settings.loginAgreement?.showInAnonymousMode ?? true}
          onChange={(e) =>
            setSettings({
              ...settings,
              loginAgreement: {
                ...settings.loginAgreement,
                showInAnonymousMode: e.currentTarget.checked,
              },
            })
          }
          disabled={!loginEnabled}
        />

        <Text size="xs" c="dimmed">
          {t(
            "admin.settings.legal.loginAgreement.restartNote",
            "Enabling or disabling the agreement applies after a restart, like other settings. Text edits below apply immediately.",
          )}
        </Text>

        <Divider />

        <LoginAgreementEditor disabled={!loginEnabled} />
      </Stack>
    </Paper>
  );
}
