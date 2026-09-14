import apiClient from "@app/services/apiClient";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

export type LoginLandingMode = "editor" | "dynamic";

export function isPortalAvailable(): boolean {
  return import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;
}

export function loginLandingMode(): LoginLandingMode {
  return import.meta.env.VITE_LOGIN_LANDING_MODE === "editor"
    ? "editor"
    : "dynamic";
}

interface MeUser {
  portalAccess?: boolean;
  loginLandingView?: string;
}

export type RootDestination = "processor" | "editor" | "signedOut";

function editorRegardless(): boolean {
  return loginLandingMode() !== "dynamic" || !isPortalAvailable();
}

export async function resolveRootTarget(): Promise<string | null> {
  if (editorRegardless()) return EDITOR_BASENAME;
  const destination = await fetchRootDestination();
  if (destination === "signedOut") return null;
  return destination === "processor" ? PORTAL_BASENAME : EDITOR_BASENAME;
}

export async function resolveLandingPath(): Promise<string> {
  return (await resolveRootTarget()) ?? EDITOR_BASENAME;
}

export async function fetchRootDestination(): Promise<RootDestination> {
  let user: MeUser | undefined;
  try {
    const me = await apiClient.get<{ user?: MeUser }>("/api/v1/auth/me", {
      suppressErrorToast: true,
    });
    user = me.data?.user;
  } catch {
    return "signedOut";
  }
  if (!user) return "signedOut";

  return user.loginLandingView === "processor" && user.portalAccess === true
    ? "processor"
    : "editor";
}
