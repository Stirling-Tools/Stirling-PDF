import type { AccountLinkSettingsSeam } from "@portal-proprietary/components/settings/accountLinkSettings";

/**
 * SaaS has no account-link concept — the signed-in account IS the SaaS account.
 * This seam omits the self-hosted link flow. SaaS settings provide owner-only
 * connected-instance management through their own navigation and session.
 */
export const accountLinkSettings: AccountLinkSettingsSeam | null = null;
