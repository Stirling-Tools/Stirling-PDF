import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import "@shared/auth/ui/auth.css";
import "@app/routes/authShared/saas-auth.css";
import { withBasePath } from "@app/constants/app";
import ErrorMessage from "@shared/auth/ui/ErrorMessage";
import loginHeader from "@shared/assets/brand/modern-logo/LoginLightModeHeader.svg";

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
        <p
          style={{
            textAlign: "center",
            marginBottom: "1.5rem",
            color: "#374151",
          }}
        >
          {t(
            "oauthConsent.signInPrompt",
            "Sign in to your Stirling PDF account to continue connecting the app.",
          )}
        </p>
        <button
          type="button"
          className="oauth-button-fullwidth"
          onClick={() => navigate(`/login?next=${encodeURIComponent(next)}`)}
        >
          {t("oauthConsent.signInButton", "Sign in to continue")}
        </button>
      </AuthLayout>
    );
  }

  if (sessionLoading || loadingDetails || redirecting) {
    return (
      <AuthLayout>
        {logoBlock}
        <p style={{ textAlign: "center", color: "#6b7280" }}>
          {redirecting
            ? t("oauthConsent.redirecting", "Returning you to the app...")
            : t("oauthConsent.loading", "Loading authorization request...")}
        </p>
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

      {/* AuthLayout forces light mode but text without explicit colors still
          inherits dark-scheme values from the app CSS; pin them like the rest
          of the auth pages do. */}
      <h2
        style={{
          textAlign: "center",
          fontSize: "1.25rem",
          fontWeight: 700,
          marginBottom: "0.5rem",
          color: "#111827",
        }}
      >
        {t("oauthConsent.title", "Authorize access")}
      </h2>
      <p
        style={{
          textAlign: "center",
          marginBottom: "1.5rem",
          color: "#374151",
        }}
      >
        {t("oauthConsent.requesting", {
          app: appName,
          defaultValue: `${appName} wants to access your Stirling PDF account`,
        })}
      </p>

      {/* Be explicit about what connecting actually grants. The OAuth scopes
          (openid/email) only cover identity; the real power is that the issued
          token lets the app drive the MCP endpoint - i.e. run any Stirling PDF
          tool as this user, audited as them and counted against their usage. */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          background: "#ffffff",
        }}
      >
        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            margin: "0 0 0.5rem",
            color: "#111827",
          }}
        >
          {t("oauthConsent.scopesIntro", {
            app: appName,
            defaultValue: `This will allow ${appName} to:`,
          })}
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          <li style={{ fontSize: "0.875rem", color: "#374151" }}>
            {t("oauthConsent.access.tools", {
              app: appName,
              defaultValue: `Use your Stirling PDF tools on your behalf - convert, edit, sign, secure and process your documents`,
            })}
          </li>
          <li style={{ fontSize: "0.875rem", color: "#374151" }}>
            {t("oauthConsent.access.actAsYou", {
              app: appName,
              defaultValue: `Act as you - everything ${appName} does runs under your account and counts towards your usage`,
            })}
          </li>
          {scopes.map((scope) => (
            <li key={scope} style={{ fontSize: "0.875rem", color: "#374151" }}>
              {scopeDescription(scope)}
            </li>
          ))}
        </ul>
      </div>

      <ErrorMessage error={error} />

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <button
          type="button"
          disabled={deciding !== null}
          onClick={() => decide("approve")}
          style={{
            width: "100%",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#000000",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "1rem",
            cursor: deciding ? "default" : "pointer",
            opacity: deciding && deciding !== "approve" ? 0.6 : 1,
          }}
        >
          {deciding === "approve"
            ? t("oauthConsent.approving", "Allowing...")
            : t("oauthConsent.approve", "Allow access")}
        </button>
        <button
          type="button"
          disabled={deciding !== null}
          onClick={() => decide("deny")}
          className="oauth-button-fullwidth"
        >
          {deciding === "deny"
            ? t("oauthConsent.denying", "Denying...")
            : t("oauthConsent.deny", "Deny")}
        </button>
      </div>

      {displayName && (
        <p
          style={{
            textAlign: "center",
            fontSize: "0.8125rem",
            color: "#9ca3af",
            marginTop: "1.25rem",
          }}
        >
          {t("oauthConsent.signedInAs", {
            name: displayName,
            defaultValue: `Signed in as ${displayName}`,
          })}
        </p>
      )}
    </AuthLayout>
  );
}
