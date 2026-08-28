/**
 * Is `path` safe to send a user back to after they log in?
 */
export function isSafePostLoginRedirect(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return false;
  }
  const lowered = path.toLowerCase();
  return !lowered.startsWith("/login") && !lowered.startsWith("/auth/");
}
