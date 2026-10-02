import { bindAccountLinkSession as bindForUser } from "@portal-proprietary/auth/accountLinkSession";
import { connectionIdentityKey } from "@app/services/connectionIdentity";

export { clearAccountLinkSession } from "@portal-proprietary/auth/accountLinkSession";

/**
 * A local user id names an account on one server only, and desktop moves
 * between servers, so the billing session is bound to the connection too: the
 * same id on another server must not inherit this one's Stirling session.
 */
export function bindAccountLinkSession(userId: string | number | null): void {
  bindForUser(userId == null ? null : `${connectionIdentityKey()}#${userId}`);
}
