import type { ComponentType, ReactNode } from "react";
import { LinkIcon } from "@portal/components/icons";
import { AccountLinkPanel } from "@portal/components/account-link/AccountLinkPanel";

export interface AccountLinkSettingsSeam {
  /** Section key in the Settings nav + body switch. */
  navKey: string;
  /** i18n key for the nav label; resolved with `t()` at the call site. */
  labelKey: string;
  icon: ReactNode;
  /** The section body — the account-link panel. */
  Body: ComponentType;
}

/**
 * The admin "Account link" section of Settings (self-hosted only). The SaaS
 * build shadows this file with `null`: the signed-in account IS the SaaS
 * account, so there is no instance to link — the nav item and its panel both
 * drop out, and nothing imports the link-only AccountLinkPanel.
 */
export const accountLinkSettings: AccountLinkSettingsSeam | null = {
  navKey: "account-link",
  labelKey: "portal.settings.sections.account-link",
  icon: <LinkIcon size={16} />,
  Body: AccountLinkPanel,
};
