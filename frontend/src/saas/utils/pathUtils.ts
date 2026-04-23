import { URL_TO_TOOL_MAP } from "@app/utils/urlMapping";

const SUBPATH = import.meta.env.VITE_RUN_SUBPATH.replace(/^\/|\/$/g, ""); // "app" or ""

/**
 * Normalize pathname by stripping subpath prefix and trailing slashes
 */
export function normalizePath(pathname: string): string {
  // Ensure leading slash, strip subpath prefix if configured
  let p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (SUBPATH && p.startsWith(`/${SUBPATH}/`)) {
    p = p.slice(SUBPATH.length + 1); // remove "/app"
  } else if (SUBPATH && p === `/${SUBPATH}`) {
    p = "/";
  }
  // Strip trailing slash except root
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/**
 * Check if pathname is an auth route
 */
export function isAuthRoute(pathname: string): boolean {
  const p = normalizePath(pathname);
  return p === "/login" || p === "/signup" || p === "/auth/callback";
}

/**
 * Check if pathname is home route
 */
export function isHomeRoute(pathname: string): boolean {
  return normalizePath(pathname) === "/";
}

/**
 * Check if pathname is a tool route
 */
export function isToolRoute(pathname: string): boolean {
  const p = normalizePath(pathname);
  // direct match or try without trailing slash variants if your map uses them
  if (URL_TO_TOOL_MAP[p] !== undefined) return true;
  // Fallback: try adding/removing trailing slash
  if (URL_TO_TOOL_MAP[`${p}/`] !== undefined) return true;
  if (p.endsWith("/") && URL_TO_TOOL_MAP[p.slice(0, -1)] !== undefined)
    return true;
  return false;
}
