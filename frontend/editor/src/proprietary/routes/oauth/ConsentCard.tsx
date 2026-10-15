import { List, Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import ErrorMessage from "@app/auth/ui/ErrorMessage";
import type {
  ConsentDecision,
  ConsentDetails,
} from "@app/routes/oauth/useMcpConsent";

interface ConsentCardProps {
  details: ConsentDetails;
  error: string | null;
  deciding: ConsentDecision | null;
  signedInAs: string | null;
  onDecide: (action: ConsentDecision) => void;
}

function useScopeLabel() {
  const { t } = useTranslation();
  return (scope: string): string | null => {
    if (scope === "mcp.tools.read") {
      return t(
        "oauthConsent.scope.toolsRead",
        "Read your documents and run read-only tools",
      );
    }
    if (scope === "mcp.tools.write") {
      return t(
        "oauthConsent.scope.toolsWrite",
        "Convert, edit, sign and secure your documents",
      );
    }
    if (scope === "offline_access") {
      return t(
        "oauthConsent.scope.offlineAccess",
        "Stay connected without asking you to sign in again",
      );
    }
    return scope;
  };
}

/** What the app is asking for, and the allow and deny buttons. */
export function ConsentCard({
  details,
  error,
  deciding,
  signedInAs,
  onDecide,
}: ConsentCardProps) {
  const { t } = useTranslation();
  const scopeLabel = useScopeLabel();
  const app =
    details.client?.name ||
    t("oauthConsent.unknownApp", "A third-party application");
  const scopes = (details.scope || "").split(/\s+/).filter(Boolean);
  return (
    <>
      <Text component="h2" ta="center" fw={700} fz="xl" mb="xs">
        {t("oauthConsent.title", "Authorize access")}
      </Text>
      <Text
        ta="center"
        c="dimmed"
        mb={details.client?.domain || details.client?.redirectHost ? 4 : "lg"}
      >
        {t("oauthConsent.requesting", {
          app,
          defaultValue: `${app} wants to access your Stirling PDF account`,
        })}
      </Text>
      {details.client?.domain && (
        <Text ta="center" size="xs" c="dimmed" mb="lg">
          {t("oauthConsent.verifiedDomain", {
            domain: details.client.domain,
            defaultValue: `Published by ${details.client.domain}`,
          })}
        </Text>
      )}
      {!details.client?.verified && details.client?.redirectHost && (
        <Text ta="center" size="sm" fw={600} mb="lg">
          {t("oauthConsent.unverifiedApp", {
            host: details.client.redirectHost,
            defaultValue: `Unverified app name. Access goes to ${details.client.redirectHost}, so only continue if you trust that site.`,
          })}
        </Text>
      )}
      <Paper withBorder p="md" mb="lg">
        <Text fw={600} fz="sm" mb="xs">
          {t("oauthConsent.scopesIntro", {
            app,
            defaultValue: `This will allow ${app} to:`,
          })}
        </Text>
        <List size="sm" spacing={4} c="dimmed">
          <List.Item>
            {t("oauthConsent.access.actAsYou", {
              app,
              defaultValue: `Act as you - everything ${app} does runs under your account and counts towards your usage`,
            })}
          </List.Item>
          {scopes.map((scope) => (
            <List.Item key={scope}>{scopeLabel(scope)}</List.Item>
          ))}
        </List>
      </Paper>
      <ErrorMessage error={error} />
      <div className="oauth-container-fullwidth">
        <Button
          fullWidth
          size="lg"
          fontSize="sm"
          accent="brand"
          className="auth-submit"
          disabled={deciding !== null}
          onClick={() => onDecide("approve")}
        >
          {deciding === "approve"
            ? t("oauthConsent.approving", "Allowing...")
            : t("oauthConsent.approve", "Allow access")}
        </Button>
        <Button
          variant="secondary"
          className="oauth-button-fullwidth"
          disabled={deciding !== null}
          onClick={() => onDecide("deny")}
        >
          {deciding === "deny"
            ? t("oauthConsent.denying", "Denying...")
            : t("oauthConsent.deny", "Deny")}
        </Button>
      </div>
      {signedInAs && (
        <Text size="sm" c="dimmed" ta="center" mt="lg">
          {t("oauthConsent.signedInAs", {
            name: signedInAs,
            defaultValue: `Signed in as ${signedInAs}`,
          })}
        </Text>
      )}
    </>
  );
}
