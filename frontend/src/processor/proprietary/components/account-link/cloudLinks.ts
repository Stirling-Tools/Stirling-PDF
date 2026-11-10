/**
 * A page on the Stirling Cloud web app, or null when there is no address. The cloud a server is
 * linked to reports its own address at link time; that wins over the cloud this build defaults to,
 * which is a different one in staging and local setups.
 */
export function cloudUrl(
  path: string,
  linkedAppUrl?: string | null,
): string | null {
  const base = (
    linkedAppUrl || import.meta.env.VITE_SAAS_FRONTEND_URL
  )?.replace(/\/+$/, "");
  return base ? `${base}${path}` : null;
}
