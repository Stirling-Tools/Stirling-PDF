import { useAccountLinkOptional } from "@app/portal/contexts/AccountLinkContext";

/**
 * Whether this server was linked with a key from Stirling Cloud. Such a server holds no cloud
 * session, so its billing is read-only here and managed on stirling.com.
 */
export function useKeyLinked(): boolean {
  const status = useAccountLinkOptional()?.status;
  return Boolean(status?.linked && status.linkMethod === "KEY");
}
