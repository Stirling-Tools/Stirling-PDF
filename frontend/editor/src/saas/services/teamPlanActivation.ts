/** Hosted Team capacity is fulfilled in SaaS; members cannot resync the host's installation licence. */
export async function requiresLocalTeamActivation(): Promise<boolean> {
  return false;
}
