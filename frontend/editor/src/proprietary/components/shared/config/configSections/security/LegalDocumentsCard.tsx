import { useTranslation } from "react-i18next";
import { TextInput, Stack, Paper, Text, Group, Alert } from "@mantine/core";
import WarningIcon from "@mui/icons-material/Warning";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import type { LegalCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/**
 * Links to the instance's own legal documents. The responsibility warning sits
 * inside this card, not at page level, where it would read as covering the JWT
 * and SSRF settings above it too.
 */
export function LegalDocumentsCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: LegalCardProps) {
  const { t } = useTranslation();

  return (
    <>
      <Alert
        icon={<WarningIcon style={{ fontSize: 18 }} />}
        title={t(
          "admin.settings.legal.disclaimer.title",
          "Legal Responsibility Warning",
        )}
        color="yellow"
        variant="light"
      >
        <Text size="sm">
          {t(
            "admin.settings.legal.disclaimer.message",
            "By customizing these legal documents, you assume full responsibility for ensuring compliance with all applicable laws and regulations, including but not limited to GDPR and other EU data protection requirements. Only modify these settings if: (1) you are operating a personal/private instance, (2) you are outside EU jurisdiction and understand your local legal obligations, or (3) you have obtained proper legal counsel and accept sole responsibility for all user data and legal compliance. Stirling-PDF and its developers assume no liability for your legal obligations.",
          )}
        </Text>
      </Alert>

      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.legal.termsAndConditions.label",
                      "Terms and Conditions",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("termsAndConditions")} />
                </Group>
              }
              description={t(
                "admin.settings.legal.termsAndConditions.description",
                "URL or filename to terms and conditions",
              )}
              value={settings.termsAndConditions || ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  termsAndConditions: e.target.value,
                })
              }
              placeholder="https://example.com/terms"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.legal.privacyPolicy.label",
                      "Privacy Policy",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("privacyPolicy")} />
                </Group>
              }
              description={t(
                "admin.settings.legal.privacyPolicy.description",
                "URL or filename to privacy policy",
              )}
              value={settings.privacyPolicy || ""}
              onChange={(e) =>
                setSettings({ ...settings, privacyPolicy: e.target.value })
              }
              placeholder="https://example.com/privacy"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.legal.accessibilityStatement.label",
                      "Accessibility Statement",
                    )}
                  </span>
                  <PendingBadge
                    show={isFieldPending("accessibilityStatement")}
                  />
                </Group>
              }
              description={t(
                "admin.settings.legal.accessibilityStatement.description",
                "URL or filename to accessibility statement",
              )}
              value={settings.accessibilityStatement || ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  accessibilityStatement: e.target.value,
                })
              }
              placeholder="https://example.com/accessibility"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t(
                      "admin.settings.legal.cookiePolicy.label",
                      "Cookie Policy",
                    )}
                  </span>
                  <PendingBadge show={isFieldPending("cookiePolicy")} />
                </Group>
              }
              description={t(
                "admin.settings.legal.cookiePolicy.description",
                "URL or filename to cookie policy",
              )}
              value={settings.cookiePolicy || ""}
              onChange={(e) =>
                setSettings({ ...settings, cookiePolicy: e.target.value })
              }
              placeholder="https://example.com/cookies"
              disabled={!loginEnabled}
            />
          </div>

          <div>
            <TextInput
              label={
                <Group gap="xs">
                  <span>
                    {t("admin.settings.legal.impressum.label", "Impressum")}
                  </span>
                  <PendingBadge show={isFieldPending("impressum")} />
                </Group>
              }
              description={t(
                "admin.settings.legal.impressum.description",
                "URL or filename to impressum (required in some jurisdictions)",
              )}
              value={settings.impressum || ""}
              onChange={(e) =>
                setSettings({ ...settings, impressum: e.target.value })
              }
              placeholder="https://example.com/impressum"
              disabled={!loginEnabled}
            />
          </div>
        </Stack>
      </Paper>
    </>
  );
}
