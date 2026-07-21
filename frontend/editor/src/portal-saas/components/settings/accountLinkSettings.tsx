import type { AccountLinkSettingsSeam } from "@portal-proprietary/components/settings/accountLinkSettings";

/**
 * SaaS has no account-link concept — the signed-in account IS the SaaS account.
 * Null drops the "Account link" nav item and its panel from the shared settings
 * modal (the portal host treats the seam as optional), so the link-only
 * AccountLinkPanel is never imported into the SaaS bundle.
 */
export const accountLinkSettings: AccountLinkSettingsSeam | null = null;
