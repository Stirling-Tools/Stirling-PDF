import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import apiClient from "@app/services/apiClient";
import ErrorMessage from "@app/auth/ui/ErrorMessage";
import { OAuthPageShell } from "@app/routes/oauth/OAuthPageShell";

const OAUTH_PARAMS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "state",
  "scope",
  "resource",
  "code_challenge",
  "code_challenge_method",
] as const;

function errorDescription(err: unknown): string | undefined {
  return (err as { response?: { data?: { error_description?: string } } })
    ?.response?.data?.error_description;
}

/**
 * Authorization endpoint of the built-in MCP OAuth server. An SPA route so sign-in is the normal
 * login round-trip; nothing goes back to redirect_uri until the backend has matched it to the client.
 */
export default function OAuthAuthorize() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  useDocumentMeta({
    title: `${t("oauthConsent.title", "Authorize access")} - Stirling PDF`,
  });

  useEffect(() => {
    if (loading) return;
    if (!session) {
      const from = `${location.pathname}${location.search}`;
      navigate(`/login?from=${encodeURIComponent(from)}`, { replace: true });
      return;
    }
    // Submit once: a second POST would only register a duplicate pending request.
    if (submitted.current) return;
    submitted.current = true;
    const query = new URLSearchParams(location.search);
    const body = Object.fromEntries(
      OAUTH_PARAMS.map((key) => [key, query.get(key)]),
    );
    const failed = t(
      "oauthAuthorize.failed",
      "This connection request could not be started. Try connecting again from your app.",
    );
    apiClient
      .post<{ authorization_id?: string }>(
        "/api/v1/mcp/oauth/authorizations",
        body,
      )
      .then((response) => {
        const id = response.data?.authorization_id;
        if (!id) {
          setError(failed);
          return;
        }
        navigate(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`, {
          replace: true,
        });
      })
      .catch((err: unknown) => {
        console.error("[OAuthAuthorize] Could not start authorization:", err);
        setError(errorDescription(err) || failed);
      });
  }, [session, loading, location.pathname, location.search, navigate, t]);

  return (
    <OAuthPageShell>
      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <Text ta="center" c="dimmed">
          {t("oauthConsent.loading", "Loading authorization request...")}
        </Text>
      )}
    </OAuthPageShell>
  );
}
