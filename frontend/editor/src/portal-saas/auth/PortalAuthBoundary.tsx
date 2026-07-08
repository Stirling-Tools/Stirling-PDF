import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@app/auth";
import { useAuth } from "@app/auth/context";
import { Spinner } from "@app/ui";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

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
 * SaaS gate: viewing your own usage is not admin-gated, so require only a session
 * (not portalAccess). No session → bounce to the editor's Supabase login, which
 * returns here signed in. This is deliberately laxer than the self-hosted
 * RequirePortalAccess admin gate.
 */
function SaasPortalGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  useEffect(() => {
    if (!loading && !session) {
      window.location.href = "/login";
    }
  }, [loading, session]);
  if (loading || !session) {
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
