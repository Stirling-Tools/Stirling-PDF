/** A page on the Stirling Cloud web app, or null when this build has no cloud address. */
export function cloudUrl(path: string): string | null {
  const base = import.meta.env.VITE_SAAS_FRONTEND_URL?.replace(/\/+$/, "");
  return base ? `${base}${path}` : null;
}
