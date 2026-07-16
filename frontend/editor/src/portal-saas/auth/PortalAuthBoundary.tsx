import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@app/auth";
import { useAuth } from "@app/auth/context";
import { Spinner } from "@app/ui";
import { withBasePath } from "@app/constants/app";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";
import { EDITOR_URL } from "@portal/auth/editorUrl";

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

/**
 * SaaS gate: viewing your own usage is not admin-gated, so any real (signed-in,
 * non-guest) account may enter - deliberately laxer than the self-hosted
 * RequirePortalAccess admin gate. But an anonymous guest session has no account
 * to view or manage, so it is not eligible: bounce it to the editor (where a
 * guest can sign up), mirroring the self-hosted forbidden path. No session at
 * all -> the editor's Supabase login, which returns here signed in.
 */
function SaasPortalGate({ children }: { children: ReactNode }) {
  const { session, loading, isAnonymous } = useAuth();
  const blocked = !loading && (!session || isAnonymous);
  useEffect(() => {
    if (!blocked) return;
    // Guest (has a session but anonymous) -> editor; no session -> login.
    window.location.href = session ? EDITOR_URL : withBasePath("/login");
  }, [blocked, session]);
  if (loading || blocked) {
    return (
      <FullScreen>
        <Spinner size="lg" />
      </FullScreen>
    );
  }
  return <>{children}</>;
}

/**
 * SaaS override of the portal auth boundary: authenticate against the SaaS Supabase
 * project (inheriting the editor's session) instead of the self-hosted Spring login.
 */
export function PortalAuthBoundary({ children }: { children: ReactNode }) {
  // Configure the shared Supabase client (SaaS project) synchronously here, before
  // the AuthProvider below reads it — a useEffect would run too late for the first
  // render, leaving the provider with a null client. Idempotent; the portal mounts
  // outside the editor's AppProviders but against the SAME project, so a user already
  // signed into the editor is picked up from the persisted session (no second login).
  ensureSaasSupabase();
  return (
    <AuthProvider mode="supabase">
      <SaasPortalGate>{children}</SaasPortalGate>
    </AuthProvider>
  );
}
