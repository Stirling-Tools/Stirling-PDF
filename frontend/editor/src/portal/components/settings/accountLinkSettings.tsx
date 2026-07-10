import type { ComponentType } from "react";
import { AccountLinkPanel } from "@portal/components/account-link/AccountLinkPanel";

export interface AccountLinkSettingsSeam {
  /** Nav key in the shared settings modal (registered in config/types.ts). */
  navKey: "account-link";
  /** i18n key for the nav label; resolved with `t()` at the call site. */
  labelKey: string;
  /** LocalIcon name for the nav item. */
  icon: string;
  /** The section body — the account-link panel. */
  Body: ComponentType;
}

/**
 * The admin "Account link" section of the shared settings modal (self-hosted
 * only). The SaaS build shadows this file with `null`: the signed-in account IS
 * the SaaS account, so there is no instance to link — the nav item and its
 * panel both drop out, and nothing imports the link-only AccountLinkPanel.
 */
export const accountLinkSettings: AccountLinkSettingsSeam | null = {
  navKey: "account-link",
  labelKey: "portal.settings.sections.account-link",
  icon: "link-rounded",
  Body: AccountLinkPanel,
};
