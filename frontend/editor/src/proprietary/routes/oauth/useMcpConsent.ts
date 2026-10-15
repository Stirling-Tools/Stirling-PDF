import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";

const BASE = "/api/v1/mcp/oauth/authorizations";

export interface ConsentDetails {
  authorization_id: string;
  redirect_uri?: string;
  scope?: string;
  client?: {
    id?: string;
    name?: string;
    domain?: string;
    verified?: boolean;
    redirectHost?: string;
  };
}

interface RedirectResponse {
  redirect_url: string;
}

const isRedirect = (body: unknown): body is RedirectResponse =>
  typeof body === "object" &&
  body !== null &&
  typeof (body as RedirectResponse).redirect_url === "string";

const isDetails = (body: unknown): body is ConsentDetails =>
  typeof body === "object" && body !== null && "authorization_id" in body;

export type ConsentDecision = "approve" | "deny";

/**
 * Loads a pending authorization and submits the decision. An already-granted client gets its
 * code on load, so the browser is sent straight back without asking again.
 */
export function useMcpConsent(authorizationId: string | null, ready: boolean) {
  const { t } = useTranslation();
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<ConsentDecision | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  // The load can consume the authorization, so it runs once per id and is never discarded.
  const loadedFor = useRef<string | null>(null);

  const follow = useCallback((url: string) => {
    setRedirecting(true);
    window.location.assign(url);
  }, []);

  useEffect(() => {
    if (!ready || !authorizationId || loadedFor.current === authorizationId) {
      return;
    }
    loadedFor.current = authorizationId;
    const loadFailed = t(
      "oauthConsent.loadFailed",
      "This authorization request is invalid or has expired. Close this tab and try connecting again from the app.",
    );
    apiClient
      .get<unknown>(`${BASE}/${encodeURIComponent(authorizationId)}`)
      .then(({ data }) => {
        if (isRedirect(data)) {
          follow(data.redirect_url);
          return;
        }
        if (isDetails(data)) {
          setDetails(data);
          return;
        }
        setError(loadFailed);
      })
      .catch((err: unknown) => {
        console.error("[OAuthConsent] Failed to load authorization:", err);
        setError(loadFailed);
      });
  }, [ready, authorizationId, follow, t]);

  const decide = useCallback(
    async (action: ConsentDecision) => {
      if (!authorizationId || deciding) return;
      setDeciding(action);
      setError(null);
      try {
        const { data } = await apiClient.post<unknown>(
          `${BASE}/${encodeURIComponent(authorizationId)}/consent`,
          { action },
        );
        if (isRedirect(data)) {
          follow(data.redirect_url);
          return;
        }
        throw new Error("Consent response had no redirect_url");
      } catch (err) {
        console.error("[OAuthConsent] Consent call failed:", err);
        setError(
          t(
            "oauthConsent.decisionFailed",
            "Could not complete this authorization. It may already have been used or expired - start the connection again from your app.",
          ),
        );
        setDeciding(null);
      }
    },
    [authorizationId, deciding, follow, t],
  );

  return { details, error, deciding, redirecting, decide };
}
