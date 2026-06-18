import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  SpringAuthProvider,
  deriveDisplayName as deriveDisplayNameShared,
} from "@shared/auth/spring/UseSession";
import { useAuth as useSharedAuth } from "@shared/auth/context";
import type { AuthUser } from "@shared/auth/types";
// Side-effect import: wires the editor's transport + platform seams into the
// shared Spring engine before AppProviders mounts the provider below.
import "@app/auth/configureSpringAuth";

export type { AuthUser as User } from "@shared/auth/types";

/**
 * Editor display-name helper. Keeps the i18next `TFunction` signature the
 * editor's components and tests rely on, delegating to the shared
 * implementation for the actual logic (anonymous placeholder vs username/email).
 */
export function deriveDisplayName(
  user: AuthUser | null | undefined,
  t: TFunction,
): string | null {
  return deriveDisplayNameShared(user, (key, fallback) => t(key, fallback));
}

/**
 * Auth Provider for the editor. Wraps the shared Spring provider and feeds it an
 * i18next-backed translate function so the localised "User" placeholder still
 * works for anonymous sessions.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <SpringAuthProvider translate={(key, fallback) => t(key, fallback)}>
      {children}
    </SpringAuthProvider>
  );
}

/** Hook to access auth context. Must be used within AuthProvider. */
export function useAuth() {
  return useSharedAuth();
}

/** Debug alias kept for backwards compatibility with existing callers. */
export function useAuthDebug() {
  return useSharedAuth();
}
