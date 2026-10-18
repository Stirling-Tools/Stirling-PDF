import { stripBasePath, withBasePath } from "@app/constants/app";
import { isSafePostLoginRedirect } from "@app/services/postLoginRedirect";

/** Keep the attended page as the destination for normal app sign-in. */
export function redirectToLogin(): void {
  const loginPath = withBasePath("/login");
  // Already on the login page: another redirect would just loop.
  if (window.location.pathname === loginPath) return;
  const returnPath =
    stripBasePath(window.location.pathname) + window.location.search;
  window.location.href = isSafePostLoginRedirect(returnPath)
    ? `${loginPath}?next=${encodeURIComponent(returnPath)}`
    : loginPath;
}
