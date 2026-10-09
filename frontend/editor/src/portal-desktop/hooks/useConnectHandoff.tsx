import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { HttpError } from "@app/portal/api/http";
import {
  completeConnect,
  startConnect,
  startReauth,
  type ConnectPhase,
} from "@app/portal/api/link";
import { approveConnect, requestIdOf } from "@app/portal/api/connectApproval";
import { ensureSaasSupabase } from "@app/portal/auth/saasSupabase";
import {
  isTerminalSaasAuthError,
  portalSaasSessionRestored,
} from "@app/portal/auth/portalSaasSession";
import {
  CloudSignInStep,
  type CloudSignInStage,
} from "@app/portal/components/account-link/connect/CloudSignInStep";
import type { ConnectCallbackState } from "@app/portal/components/account-link/ConnectCallbackView";
import { useAccountLinkContext } from "@app/portal/contexts/AccountLinkContext";
import { useUI } from "@app/portal/contexts/UIContext";
import { useAccountLinkOwner } from "@app/portal/hooks/useAccountLinkOwner";
import type { ConnectHandoff } from "@portal-proprietary/hooks/useConnectHandoff";
import { getPortalQueryClient } from "@app/portal/queryClient";
import { clearAccountLinkBlock } from "@app/services/accountLinkBlock";
import {
  CloudSignInError,
  signInToCloudWithPassword,
  signInToCloudWithProvider,
  type CloudTokens,
} from "@app/services/cloudSignIn";
import { connectedServerBaseUrl } from "@app/services/connectedServerBaseUrl";
import { connectionIdentityKey } from "@app/services/connectionIdentity";
import { buildOAuthCallbackHtml } from "@app/utils/oauthCallbackHtml";

type Stage = "idle" | "starting" | CloudSignInStage;

/**
 * Desktop runs the whole handshake in the app. The web sends the admin to
 * Stirling's approval page and back through a callback, but a webview cannot be
 * the callback and its origin is not the server's. Here the admin signs in to
 * Stirling with the app's own native sign-in, the app approves the request as
 * that account and completes it on the server, and the same tokens become the
 * billing session. Abandoned attempts leave a pending request that expires; the
 * next start replaces it.
 */
export function useConnectHandoff(reauth: boolean): ConnectHandoff {
  const { t } = useTranslation();
  const isOwner = useAccountLinkOwner();
  const { refresh } = useAccountLinkContext();
  const { publishConnectOutcome } = useUI();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const identity = useRef("");
  const publish = useRef(publishConnectOutcome);
  publish.current = publishConnectOutcome;
  const refreshLink = useRef(refresh);
  refreshLink.current = refresh;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Closing the dialog unmounts this; a switch of server or account remounts it.
  const current = useCallback(
    () => mounted.current && identity.current === connectionIdentityKey(),
    [],
  );

  const fail = useCallback((message: string) => {
    inFlight.current = false;
    requestId.current = null;
    setError(message);
    setStage("idle");
  }, []);

  const begin = useCallback(() => {
    if (!isOwner) {
      setError(
        t(
          "portal.accountLink.ownerRequired",
          "Only the org owner can link or unlink this server.",
        ),
      );
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    identity.current = connectionIdentityKey();
    setError(null);
    setSignInError(null);
    setStage("starting");
    void (async () => {
      try {
        // No callback: nothing follows it here, and the server falls back to its own address.
        const status = reauth
          ? await startReauth()
          : await startConnect(connectedServerBaseUrl());
        if (!current()) return;
        const id = status.authorizeUrl
          ? requestIdOf(status.authorizeUrl)
          : null;
        if (!id) {
          fail(
            t(
              "portal.accountLink.modal.noAuthorizeUrl",
              "Stirling did not return somewhere to continue. Try again in a moment.",
            ),
          );
          return;
        }
        requestId.current = id;
        setStage("choose");
      } catch (error) {
        if (!current()) return;
        if (error instanceof HttpError && error.status === 403) {
          fail(
            t(
              "portal.accountLink.ownerRequired",
              "Only the org owner can link or unlink this server.",
            ),
          );
        } else if (
          !reauth &&
          error instanceof HttpError &&
          error.status === 409
        ) {
          fail(
            t(
              "portal.accountLink.modal.transferPending",
              "An ownership transfer is pending. Go to Settings → Users to finish or cancel it, then try linking again.",
            ),
          );
        } else {
          fail(
            t(
              "portal.accountLink.modal.startFailed",
              "Could not reach Stirling to start the connection. Check this server's outbound network access, then try again.",
            ),
          );
        }
      }
    })();
  }, [isOwner, reauth, t, fail, current]);

  const mode = reauth ? ("reauth" as const) : ("link" as const);

  /** The server's half, then the session. Re-entered by a retry, which skips what succeeded. */
  const finish = useCallback(
    (nonce: string, tokens: CloudTokens) => {
      let accepted = false;
      const settle = async (): Promise<void> => {
        if (!current()) return;
        publish.current({ mode, state: "working", sessionRestored: false });
        try {
          if (!accepted) {
            const state = toViewState((await completeConnect(nonce)).phase);
            if (!current()) return;
            if (state !== "linked") {
              publish.current({
                mode,
                state,
                sessionRestored: false,
                reclaim: state === "retry" ? () => void settle() : undefined,
              });
              return;
            }
            accepted = true;
            clearAccountLinkBlock();
            await refreshLink.current();
            if (!current()) return;
          }
          const supabase = ensureSaasSupabase();
          if (!supabase) throw new Error("Stirling sign-in is not configured");
          const { error } = await supabase.auth.setSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          });
          if (error) throw error;
          portalSaasSessionRestored();
          void getPortalQueryClient().invalidateQueries();
          if (current()) {
            publish.current({ mode, state: "linked", sessionRestored: true });
          }
        } catch (error) {
          if (!current()) return;
          if (
            isTerminalSaasAuthError(error) ||
            (error instanceof HttpError &&
              (error.status === 403 || error.status === 409))
          ) {
            publish.current({
              mode,
              state: "rejected",
              sessionRestored: false,
            });
            return;
          }
          publish.current({
            mode,
            state: "retry",
            sessionRestored: false,
            reclaim: () => void settle(),
          });
        }
      };
      return settle();
    },
    [mode, current],
  );

  const continueAs = useCallback(
    async (signIn: () => Promise<CloudTokens>, waiting: CloudSignInStage) => {
      const id = requestId.current;
      if (!id) return;
      setSignInError(null);
      setStage(waiting);
      let tokens: CloudTokens;
      try {
        tokens = await signIn();
      } catch (error) {
        if (!current()) return;
        setSignInError(signInMessage(t, error));
        setStage("choose");
        return;
      }
      if (!current()) return;
      setStage("connecting");
      let nonce: string;
      try {
        nonce = (await approveConnect(id, tokens.accessToken)).nonce;
      } catch (error) {
        if (!current()) return;
        if (error instanceof HttpError && error.status === 404) {
          fail(
            t(
              "portal.accountLink.connect.callback.expired.body",
              "Connection requests are short lived. Start another one.",
            ),
          );
          return;
        }
        // The wrong account can be swapped for the right one without starting over.
        setSignInError(approvalMessage(t, reauth, error));
        setStage("choose");
        return;
      }
      if (!current()) return;
      inFlight.current = false;
      requestId.current = null;
      setStage("idle");
      await finish(nonce, tokens);
    },
    [finish, fail, t, reauth, current],
  );

  const onProvider = (provider: string) =>
    void continueAs(
      () =>
        signInToCloudWithProvider(
          provider,
          buildOAuthCallbackHtml({
            title: t("oauth.success.title", "Authentication Successful"),
            message: t(
              "oauth.success.message",
              "You can close this window and return to Stirling PDF.",
            ),
            isError: false,
          }),
          buildOAuthCallbackHtml({
            title: t("oauth.error.title", "Authentication Failed"),
            message: t(
              "oauth.error.message",
              "Authentication was not successful. You can close this window and try again.",
            ),
            isError: true,
            errorPlaceholder: true,
          }),
        ),
      "browser",
    );

  const onPassword = (email: string, password: string) =>
    void continueAs(
      () => signInToCloudWithPassword(email, password),
      "password",
    );

  const busy = stage !== "idle";
  const body =
    stage === "idle" || stage === "starting" ? undefined : (
      <CloudSignInStep
        reauth={reauth}
        stage={stage}
        error={signInError}
        onProvider={onProvider}
        onPassword={onPassword}
      />
    );

  return { busy, error, begin, body };
}

function toViewState(phase: ConnectPhase): ConnectCallbackState {
  switch (phase) {
    case "LINKED":
      return "linked";
    case "EXPIRED":
      return "expired";
    case "PENDING":
    case "UNAVAILABLE":
      return "retry";
    default:
      return "rejected";
  }
}

function signInMessage(t: TFunction, error: unknown): string {
  const reason = error instanceof CloudSignInError ? error.reason : "failed";
  if (reason === "credentials") {
    return t(
      "portal.accountLink.desktopSignIn.credentials",
      "Incorrect email or password.",
    );
  }
  if (reason === "timeout") {
    return t(
      "portal.accountLink.desktopSignIn.timeout",
      "Sign-in timed out. Try again.",
    );
  }
  return t(
    "portal.accountLink.desktopSignIn.failed",
    "Could not sign in to Stirling. Try again.",
  );
}

function approvalMessage(
  t: TFunction,
  reauth: boolean,
  error: unknown,
): string {
  const refused =
    error instanceof HttpError &&
    (error.status === 403 || error.status === 409);
  if (refused && reauth) {
    return t(
      "connect.renewal.currentOwnerRequired",
      "Sign in as the current owner of the linked cloud team to renew this server's sign-in. If ownership was transferred, use the new owner's account.",
    );
  }
  if (refused) {
    return t(
      "connect.error.failed",
      "That did not go through. Only a team owner can connect a server.",
    );
  }
  return t(
    "portal.accountLink.desktopSignIn.failed",
    "Could not sign in to Stirling. Try again.",
  );
}
