import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@app/auth";
import { useAuth } from "@app/auth/context";
import { Spinner } from "@app/ui";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

// Configure the shared Supabase client for the SaaS project before the provider
// reads it. The portal mounts outside the editor's AppProviders, so it establishes
// its own session — but against the SAME project, so a user already signed into the
// editor is picked up from the persisted session with no second login. Idempotent.
ensureSaasSupabase();

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
  return (
    <AuthProvider mode="supabase">
      <SaasPortalGate>{children}</SaasPortalGate>
    </AuthProvider>
  );
}
