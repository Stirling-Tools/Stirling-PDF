import { isSafePostLoginRedirect as isSafeBaseRedirect } from "@core/services/postLoginRedirect";

export function isSafePostLoginRedirect(path: unknown): path is string {
  if (!isSafeBaseRedirect(path)) return false;
  const lowered = path.toLowerCase();
  return !lowered.startsWith("/oauth2") && !lowered.startsWith("/saml2");
}
