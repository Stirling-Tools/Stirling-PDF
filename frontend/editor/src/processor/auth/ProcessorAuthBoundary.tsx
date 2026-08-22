import { type ReactNode } from "react";
import { AuthProvider } from "@app/auth";
import { AuthGate } from "@processor/components/AuthGate";

/**
 * Processor auth wiring — the seam the SaaS build overrides.
 *
 * <p>Self-hosted (this base): the processor is its own standalone app, so it owns a
 * Spring {@link AuthProvider} and a Spring login gate ({@link AuthGate}). The SaaS
 * build shadows this file to authenticate against the SaaS Supabase project (the
 * same session the editor uses) with no Spring login and no account-link step.
 */
export function ProcessorAuthBoundary({ children }: { children: ReactNode }) {
  return (
    <AuthProvider mode="spring">
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
