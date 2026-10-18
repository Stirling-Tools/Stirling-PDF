import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import ErrorMessage from "@app/auth/ui/ErrorMessage";
import { OAuthPageShell } from "@app/routes/oauth/OAuthPageShell";
import { ConsentCard } from "@app/routes/oauth/ConsentCard";
import { useMcpConsent } from "@app/routes/oauth/useMcpConsent";

/** Consent screen of the built-in MCP authorization server (mcp.auth.mode=builtin). */
export default function OAuthConsent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading: sessionLoading, displayName } = useAuth();
  const { t } = useTranslation();

  const authorizationId = useMemo(
    () => new URLSearchParams(location.search).get("authorization_id"),
    [location.search],
  );
  const consent = useMcpConsent(
    authorizationId,
    !sessionLoading && Boolean(session),
  );

  useDocumentMeta({
    title: `${t("oauthConsent.title", "Authorize access")} - Stirling PDF`,
  });

  useEffect(() => {
    if (sessionLoading || session) return;
    const from = `${location.pathname}${location.search}`;
    navigate(`/login?from=${encodeURIComponent(from)}`, { replace: true });
  }, [sessionLoading, session, location.pathname, location.search, navigate]);

  if (!authorizationId) {
    return (
      <OAuthPageShell>
        <ErrorMessage
          error={t(
            "oauthConsent.missingId",
            "Missing authorization request. Start the connection from your app and try again.",
          )}
        />
      </OAuthPageShell>
    );
  }

  if (consent.details && !consent.redirecting) {
    return (
      <OAuthPageShell>
        <ConsentCard
          details={consent.details}
          error={consent.error}
          deciding={consent.deciding}
          signedInAs={displayName}
          onDecide={(action) => void consent.decide(action)}
        />
      </OAuthPageShell>
    );
  }

  // Never ask the user to authorize an app we could not name.
  if (consent.error) {
    return (
      <OAuthPageShell>
        <ErrorMessage error={consent.error} />
      </OAuthPageShell>
    );
  }

  return (
    <OAuthPageShell>
      <Text ta="center" c="dimmed">
        {consent.redirecting
          ? t("oauthConsent.redirecting", "Returning you to the app...")
          : t("oauthConsent.loading", "Loading authorization request...")}
      </Text>
    </OAuthPageShell>
  );
}
