/** Hosted accounts use the app session; instance linking belongs to self-hosted owners. */
export function useAccountLinkOwner(): boolean {
  return false;
}
