/** Whether Team fulfilment must also refresh an independently licensed local server. */
export async function requiresLocalTeamActivation(): Promise<boolean> {
  return true;
}
