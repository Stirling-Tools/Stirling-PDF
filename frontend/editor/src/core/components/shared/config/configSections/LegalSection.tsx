import React from "react";
import { Anchor, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useFooterInfo } from "@app/hooks/useFooterInfo";
import { useCookieConsent } from "@app/hooks/useCookieConsent";

interface LegalLink {
  key: string;
  label: string;
  href: string;
}

const LegalSection: React.FC = () => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { footerInfo } = useFooterInfo();

  const analyticsEnabled =
    config?.enableAnalytics ?? footerInfo?.analyticsEnabled ?? false;
  const privacyPolicy = config?.privacyPolicy ?? footerInfo?.privacyPolicy;
  const termsAndConditions =
    config?.termsAndConditions ?? footerInfo?.termsAndConditions;
  const accessibilityStatement =
    config?.accessibilityStatement ?? footerInfo?.accessibilityStatement;
  const cookiePolicy = config?.cookiePolicy ?? footerInfo?.cookiePolicy;
  const impressum = config?.impressum ?? footerInfo?.impressum;

  const { showCookiePreferences } = useCookieConsent({
    analyticsEnabled: analyticsEnabled === true,
  });

  const isValidLink = (link?: string) => link && link.trim().length > 0;

  const legalLinks: LegalLink[] = [
    {
      key: "privacy",
      label: t("legal.privacy", "Privacy Policy"),
      href: isValidLink(privacyPolicy)
        ? privacyPolicy!
        : "https://www.stirling.com/privacy",
    },
    {
      key: "terms",
      label: t("legal.terms", "Terms and Conditions"),
      href: isValidLink(termsAndConditions)
        ? termsAndConditions!
        : "https://www.stirling.com/terms",
    },
    ...(isValidLink(accessibilityStatement)
      ? [
          {
            key: "accessibility",
            label: t("legal.accessibility", "Accessibility"),
            href: accessibilityStatement!,
          },
        ]
      : []),
    ...(isValidLink(cookiePolicy)
      ? [
          {
            key: "cookie",
            label: t("legal.cookie", "Cookie Policy"),
            href: cookiePolicy!,
          },
        ]
      : []),
    ...(isValidLink(impressum)
      ? [
          {
            key: "impressum",
            label: t("legal.impressum", "Impressum"),
            href: impressum!,
          },
        ]
      : []),
  ];

  const renderLink = (link: LegalLink) => (
    <Anchor
      key={link.key}
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      size="sm"
    >
      <Group gap={6} wrap="nowrap">
        {link.label}
        <LocalIcon icon="open-in-new-rounded" width="0.9rem" height="0.9rem" />
      </Group>
    </Anchor>
  );

  return (
    <Stack gap="lg">
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <div>
            <Text fw={600} size="sm">
              {t("settings.legal.documents.title", "Legal Documents")}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "settings.legal.documents.description",
                "Policies and legal information for this service.",
              )}
            </Text>
          </div>
          <Stack gap="sm">{legalLinks.map(renderLink)}</Stack>
        </Stack>
      </Paper>

      {analyticsEnabled === true && (
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={600} size="sm">
                {t("legal.showCookieBanner", "Cookie Preferences")}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.legal.cookiePreferences.description",
                  "Review or change your cookie consent choices.",
                )}
              </Text>
            </div>
            <Button
              variant="default"
              size="sm"
              id="cookieBanner"
              onClick={showCookiePreferences}
            >
              {t("settings.legal.cookiePreferences.manage", "Manage")}
            </Button>
          </Group>
        </Paper>
      )}
    </Stack>
  );
};

export default LegalSection;
