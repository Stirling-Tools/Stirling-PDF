import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Checkbox,
  FileInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "@app/hooks/useTranslation";
import { supabase } from "@app/auth/supabase";
import { absoluteWithBasePath, withBasePath } from "@app/constants/app";
import {
  companySsoRequest,
  companySsoError,
  type CompanySsoSettings,
} from "@app/services/companySso";

/** Team leaders configure, test their own conversion, then explicitly require company SSO. */
export default function CompanySsoSection() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<CompanySsoSettings | null>(null);
  const [metadata, setMetadata] = useState<File | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const token = async () =>
    (await supabase.auth.getSession()).data.session?.access_token;
  const reload = useCallback(async () => {
    setSettings(
      await companySsoRequest<CompanySsoSettings>("settings", await token()),
    );
  }, []);
  useEffect(() => {
    void reload().catch((e: unknown) => setError(companySsoError(e)));
  }, [reload]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await reload();
    } catch (e) {
      setError(companySsoError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="lg">
      <Title order={2}>{t("companySso.title", "Company single sign-on")}</Title>
      <Text>
        {t(
          "companySso.setupIntro",
          "Connect your company's identity provider with SAML 2.0. Microsoft Entra ID and other SAML providers are supported.",
        )}
      </Text>
      {error && (
        <Alert role="alert" color="red">
          {error}
          <Button
            variant="tertiary"
            onClick={() =>
              window.location.assign(
                withBasePath("/company-sso?connect=1&setup=1"),
              )
            }
          >
            {t("companySso.signInAgain", "Sign in again")}
          </Button>
        </Alert>
      )}
      {settings && !settings.eligible && (
        <Alert>
          {t(
            "companySso.enterpriseOnly",
            "Company SSO is available for enterprise teams. Contact Stirling to enable it for your team.",
          )}
        </Alert>
      )}
      {settings?.eligible && (
        <>
          <Alert>
            {settings.active
              ? t("companySso.active", "Company SSO is required for this team.")
              : t(
                  "companySso.draft",
                  "Setup is a draft. Your team's existing sign-in continues to work until you enable SSO.",
                )}
          </Alert>
          {!settings.active && (
            <>
              <Title order={3}>
                {t(
                  "companySso.providerStep",
                  "1. Configure your identity provider",
                )}
              </Title>
              <Text>
                {t(
                  "companySso.entraHelp",
                  "In Entra, create an enterprise application and choose SAML single sign-on. Copy these values into Basic SAML Configuration. Include an email claim and assign yourself to the application before testing.",
                )}
              </Text>
              <TextInput
                label={t("companySso.entityId", "Identifier (Entity ID)")}
                value={settings.entityId}
                readOnly
              />
              <TextInput
                label={t("companySso.acsUrl", "Reply URL (ACS)")}
                value={settings.acsUrl}
                readOnly
              />
              <FileInput
                label={t("companySso.metadata", "Federation Metadata XML")}
                accept=".xml,application/xml,text/xml"
                value={metadata}
                onChange={setMetadata}
              />
              <Button
                disabled={!metadata || metadata.size > 131072}
                loading={busy}
                onClick={() =>
                  void run(async () => {
                    if (!metadata) return;
                    await companySsoRequest("settings", await token(), {
                      metadataXml: await metadata.text(),
                    });
                    setMetadata(null);
                  })
                }
              >
                {t("companySso.save", "Save SAML connection")}
              </Button>
              <Text size="sm">
                {t(
                  "companySso.metadataLimit",
                  "Upload an XML file up to 128 KB. Saving new metadata requires another test.",
                )}
              </Text>
              {settings.connectionId && (
                <>
                  <Title order={3}>
                    {t(
                      "companySso.testStep",
                      "2. Test SSO and connect your account",
                    )}
                  </Title>
                  <Text>
                    {t(
                      "companySso.testIntro",
                      "Sign in with both your existing Stirling account and your company identity. Your team, ownership, billing and data stay with the same account.",
                    )}
                  </Text>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      window.location.assign(
                        withBasePath(
                          `/company-sso?connection=${settings.connectionId}&connect=1`,
                        ),
                      )
                    }
                  >
                    {t("companySso.test", "Test and connect my account")}
                  </Button>
                  {settings.tested && (
                    <Alert>
                      {t(
                        "companySso.testReady",
                        "A team leader has tested this configuration. The leader who completed the test can enable SSO.",
                      )}
                    </Alert>
                  )}
                  <Title order={3}>
                    {t("companySso.enableStep", "3. Require SSO for the team")}
                  </Title>
                  <Text>
                    {t(
                      "companySso.enableImpact",
                      "Members will be asked to use company SSO. Existing members must connect their account once. New users assigned to your SAML app join as Members, subject to available seats.",
                    )}
                  </Text>
                  <Checkbox
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.currentTarget.checked)}
                    label={t(
                      "companySso.enableAcknowledgement",
                      "I have tested my own access and told members how to connect their accounts.",
                    )}
                  />
                  <Button
                    disabled={!settings.tested || !acknowledged}
                    loading={busy}
                    onClick={() =>
                      void run(async () => {
                        await companySsoRequest("activate", await token(), {});
                      })
                    }
                  >
                    {t("companySso.enable", "Require company SSO")}
                  </Button>
                </>
              )}
            </>
          )}
          {settings.active && settings.connectionId && (
            <>
              <TextInput
                label={t("companySso.companyLink", "Company sign-in link")}
                value={absoluteWithBasePath(
                  `/company-sso?connection=${settings.connectionId}`,
                )}
                readOnly
              />
              <Text>
                {t(
                  "companySso.connectedCount",
                  "{{count}} accounts connected",
                  { count: settings.connectedUserIds.length },
                )}
              </Text>
              <Text>
                {t(
                  "companySso.leavers",
                  "Remove a leaver's access to the identity-provider application and remove them from Users. Directory sync is not enabled. A new successful company login can rejoin the team.",
                )}
              </Text>
              <Text>
                {t(
                  "companySso.maintenance",
                  "Contact Stirling support to rotate metadata or recover an active connection.",
                )}
              </Text>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
