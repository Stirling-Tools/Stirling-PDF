import { PORTAL_BASENAME } from "@app/routes/portalBasename";

const RETURN_KEY = "stirling.accountLinkReturnPath";

/** Only Processor routes can receive the callback outcome and reopen the existing link dialog. */
function isProcessorPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
    return false;
  try {
    const parsed = new URL(path, "https://local.invalid");
    return (
      parsed.origin === "https://local.invalid" &&
      (parsed.pathname === PORTAL_BASENAME ||
        parsed.pathname.startsWith(`${PORTAL_BASENAME}/`))
    );
  } catch {
    return false;
  }
}

/** Saves only an app-relative route, never the callback's credentials or fragment. */
export function rememberAccountLinkReturn(path: string): void {
  try {
    sessionStorage.setItem(
      RETURN_KEY,
      isProcessorPath(path) ? path.split("#")[0] : PORTAL_BASENAME,
    );
  } catch {
    // The callback can still land on Processor Home when storage is unavailable.
  }
}

/** Consumes a validated return route once; untrusted or missing storage falls back to Home. */
export function consumeAccountLinkReturn(): string {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    if (path && isProcessorPath(path)) return path.split("#")[0];
  } catch {
    // Storage failure must not prevent the single-use callback from completing.
  }
  return PORTAL_BASENAME;
}
