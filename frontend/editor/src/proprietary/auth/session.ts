/** Checkout uses the account session installed by the validated owner connection flow. */
export async function getAccessToken(): Promise<string | null> {
  // Imported on demand: the portal session module registers Supabase auth
  // listeners and would otherwise sit on the startup path of every build.
  const { getPortalSaasToken } =
    await import("@app/portal/auth/portalSaasSession");
  return getPortalSaasToken();
}
