import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { List, Paper, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import "@app/auth/ui/auth.css";
import "@app/routes/authShared/saas-auth.css";
import { withBasePath } from "@app/constants/app";
import ErrorMessage from "@app/auth/ui/ErrorMessage";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";

/**
 * OAuth 2.1 consent screen for the Supabase OAuth server (used by MCP clients
 * such as Claude). Supabase redirects the user here as
 * {SiteURL}/oauth/consent?authorization_id=X; this page loads the pending
 * authorization, shows what the third-party app is asking for, and forwards
 * the user's approve/deny decision back to Supabase, which then redirects to
 * the requesting app with an authorization code (or an error).
 *
 * The installed supabase-js does not yet wrap these endpoints, so the GoTrue
 * REST API is called directly with the user's session token.
 */

interface AuthorizationDetails {
  authorization_id: string;
  redirect_uri?: string;
  scope?: string;
  client?: {
    id?: string;
    name?: string;
    logo_uri?: string;
  };
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string;

async function gotrue(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

export default function OAuthConsent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading: sessionLoading, displayName } = useAuth();
  const { t } = useTranslation();

  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"approve" | "deny" | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const authorizationId = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("authorization_id");
    } catch (_) {
      return null;
    }
  }, [location.search]);

  useDocumentMeta({
    title: `${t("oauthConsent.title", "Authorize access")} - Stirling PDF`,
  });

  // Load the pending authorization once a session is available.
  useEffect(() => {
    if (sessionLoading || !session || !authorizationId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingDetails(true);
        const response = await gotrue(
          `oauth/authorizations/${encodeURIComponent(authorizationId)}`,
          session.access_token,
        );
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          console.error("[OAuthConsent] Failed to load authorization:", body);
          setError(
            t(
              "oauthConsent.loadFailed",
              "This authorization request is invalid or has expired. Close this tab and try connecting again from the app.",
            ),
          );
        } else {
          setDetails(body as AuthorizationDetails);
        }
      } catch (err) {
        console.error("[OAuthConsent] Unexpected error:", err);
        if (!cancelled) {
          setError(
            t(
              "oauthConsent.loadFailed",
              "This authorization request is invalid or has expired. Close this tab and try connecting again from the app.",
            ),
          );
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, session, authorizationId, t]);

  const decide = useCallback(
    async (action: "approve" | "deny") => {
      if (!session || !authorizationId || deciding) return;
      try {
        setDeciding(action);
        setError(null);
        const response = await gotrue(
          `oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`,
          session.access_token,
          { method: "POST", body: JSON.stringify({ action }) },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.redirect_url) {
          console.error("[OAuthConsent] Consent call failed:", body);
          setError(
            t(
              "oauthConsent.decisionFailed",
              "Could not submit your decision. Please try again.",
            ),
          );
          setDeciding(null);
          return;
        }
        // Send the browser back to the requesting app with the code (or error).
        setRedirecting(true);
        window.location.assign(body.redirect_url as string);
      } catch (err) {
        console.error("[OAuthConsent] Unexpected error:", err);
        setError(
          t(
            "oauthConsent.decisionFailed",
            "Could not submit your decision. Please try again.",
          ),
        );
        setDeciding(null);
      }
    },
    [session, authorizationId, deciding, t],
  );

  const appName =
    details?.client?.name ||
    t("oauthConsent.unknownApp", "A third-party application");
  const scopes = (details?.scope || "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const scopeDescription = (scope: string): string => {
    switch (scope) {
      case "openid":
        return t("oauthConsent.scope.openid", "Confirm your identity");
      case "email":
        return t("oauthConsent.scope.email", "See your email address");
      case "profile":
        return t(
          "oauthConsent.scope.profile",
          "See your basic profile information",
        );
      case "phone":
        return t("oauthConsent.scope.phone", "See your phone number");
      default:
        return scope;
    }
  };

  const logoBlock = (
    <div className="auth-logo-block">
      <img
        src={loginHeader}
        alt="Stirling PDF"
        className="auth-logo-header auth-logo-header--light"
      />
      <img
        src={withBasePath("/modern-logo/LoginDarkModeHeader.svg")}
        alt="Stirling PDF"
        className="auth-logo-header auth-logo-header--dark"
      />
    </div>
  );

  // Missing query parameter: nothing to act on.
  if (!authorizationId) {
    return (
      <AuthLayout>
        {logoBlock}
        <ErrorMessage
          error={t(
            "oauthConsent.missingId",
            "Missing authorization request. Start the connection from your app and try again.",
          )}
        />
      </AuthLayout>
    );
  }

  // Not signed in: round-trip through login and come back here.
  if (!sessionLoading && !session) {
    const next = `${location.pathname}${location.search}`;
    return (
      <AuthLayout>
        {logoBlock}
        <Text ta="center" c="dimmed" mb="lg">
          {t(
            "oauthConsent.signInPrompt",
            "Sign in to your Stirling PDF account to continue connecting the app.",
          )}
        </Text>
        <Button
          variant="secondary"
          className="oauth-button-fullwidth"
          onClick={() => navigate(`/login?next=${encodeURIComponent(next)}`)}
        >
          {t("oauthConsent.signInButton", "Sign in to continue")}
        </Button>
      </AuthLayout>
    );
  }

  if (sessionLoading || loadingDetails || redirecting) {
    return (
      <AuthLayout>
        {logoBlock}
        <Text ta="center" c="dimmed">
          {redirecting
            ? t("oauthConsent.redirecting", "Returning you to the app...")
            : t("oauthConsent.loading", "Loading authorization request...")}
        </Text>
      </AuthLayout>
    );
  }

  if (error && !details) {
    return (
      <AuthLayout>
        {logoBlock}
        <ErrorMessage error={error} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {logoBlock}

      <Text component="h2" ta="center" fw={700} fz="xl" mb="xs">
        {t("oauthConsent.title", "Authorize access")}
      </Text>
      <Text ta="center" c="dimmed" mb="lg">
        {t("oauthConsent.requesting", {
          app: appName,
          defaultValue: `${appName} wants to access your Stirling PDF account`,
        })}
      </Text>

      {/* Be explicit about what connecting actually grants. The OAuth scopes
          (openid/email) only cover identity; the real power is that the issued
          token lets the app drive the MCP endpoint - i.e. run any Stirling PDF
          tool as this user, audited as them and counted against their usage. */}
      <Paper withBorder p="md" mb="lg">
        <Text fw={600} fz="sm" mb="xs">
          {t("oauthConsent.scopesIntro", {
            app: appName,
            defaultValue: `This will allow ${appName} to:`,
          })}
        </Text>
        <List size="sm" spacing={4} c="dimmed">
          <List.Item>
            {t("oauthConsent.access.tools", {
              app: appName,
              defaultValue: `Use your Stirling PDF tools on your behalf - convert, edit, sign, secure and process your documents`,
            })}
          </List.Item>
          <List.Item>
            {t("oauthConsent.access.actAsYou", {
              app: appName,
              defaultValue: `Act as you - everything ${appName} does runs under your account and counts towards your usage`,
            })}
          </List.Item>
          {scopes.map((scope) => (
            <List.Item key={scope}>{scopeDescription(scope)}</List.Item>
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
          onClick={() => decide("approve")}
        >
          {deciding === "approve"
            ? t("oauthConsent.approving", "Allowing...")
            : t("oauthConsent.approve", "Allow access")}
        </Button>
        <Button
          variant="secondary"
          disabled={deciding !== null}
          onClick={() => decide("deny")}
          className="oauth-button-fullwidth"
        >
          {deciding === "deny"
            ? t("oauthConsent.denying", "Denying...")
            : t("oauthConsent.deny", "Deny")}
        </Button>
      </div>

      {displayName && (
        <Text size="sm" c="dimmed" ta="center" mt="lg">
          {t("oauthConsent.signedInAs", {
            name: displayName,
            defaultValue: `Signed in as ${displayName}`,
          })}
        </Text>
      )}
    </AuthLayout>
  );
}
