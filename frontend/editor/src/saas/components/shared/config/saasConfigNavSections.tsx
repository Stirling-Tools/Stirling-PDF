import React from "react";
import { type TFunction } from "i18next";
import {
  createConfigNavSections as createCoreConfigNavSections,
  type ConfigNavSection,
} from "@core/components/shared/config/configNavSections";
import HotkeysSection from "@app/components/shared/config/configSections/HotkeysSection";
import GeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import PasswordSecurity from "@app/components/shared/config/configSections/PasswordSecurity";
import ApiKeys from "@app/components/shared/config/configSections/ApiKeys";
import Plan from "@app/components/shared/config/configSections/Plan";
import {
  PaygLeader,
  PaygMember,
} from "@app/components/shared/config/configSections/Payg";

type OverviewComponent = React.ComponentType<{ onLogoutClick: () => void }>;

interface CreateSaasConfigNavSectionsOptions {
  isDev?: boolean;
  isAnonymous?: boolean;
  /**
   * Show the new Pay-as-you-go billing section. Gated on
   * `appConfig.paygEnabled` so the tenant has to be opted in.
   */
  paygEnabled?: boolean;
  /**
   * Whether the viewer is the team owner (LEADER) — controls whether the PAYG
   * screen shows editable cap/sub-cap controls or a read-only member view.
   * Until team roles land we proxy this from `appConfig.isAdmin`; replace with
   * a real team-role lookup when available.
   */
  isLeader?: boolean;
  t: TFunction<"translation", undefined>;
}

function ensurePreferencesSection(
  sections: ConfigNavSection[],
): ConfigNavSection[] {
  const preferencesIndex = sections.findIndex(
    (section) => section.title === "Preferences",
  );

  if (preferencesIndex === -1) {
    return [
      ...sections,
      {
        title: "Preferences",
        items: [
          {
            key: "general",
            label: "General",
            icon: "settings-rounded",
            component: <GeneralSection />,
          },
          {
            key: "hotkeys",
            label: "Keyboard Shortcuts",
            icon: "keyboard-rounded",
            component: <HotkeysSection />,
          },
        ],
      },
    ];
  }

  return sections;
}

function appendDeveloperSection(
  sections: ConfigNavSection[],
): ConfigNavSection[] {
  const hasDeveloper = sections.some((section) =>
    section.items.some(
      (item) => item.key === "developer" || item.key === "api-keys",
    ),
  );

  if (hasDeveloper) {
    return sections;
  }

  return [
    ...sections,
    {
      title: "Developer",
      items: [
        {
          key: "api-keys",
          label: "API Keys",
          icon: "key-rounded",
          component: <ApiKeys />,
        },
      ],
    },
  ];
}

function appendBillingSection(
  sections: ConfigNavSection[],
  t: TFunction<"translation", undefined>,
): ConfigNavSection[] {
  const hasPlan = sections.some((section) =>
    section.items.some((item) => item.key === "plan"),
  );

  if (hasPlan) {
    return sections;
  }

  return [
    ...sections,
    {
      title: "Billing",
      items: [
        {
          key: "plan",
          label: t("config.plan", "Plan"),
          icon: "credit-card",
          component: <Plan />,
        },
      ],
    },
  ];
}

function appendPaygSection(
  sections: ConfigNavSection[],
  t: TFunction<"translation", undefined>,
  isLeader: boolean,
): ConfigNavSection[] {
  if (sections.some((s) => s.items.some((i) => i.key === "payg"))) {
    return sections;
  }
  return [
    ...sections,
    {
      title: t("config.payg.section", "Pay-as-you-go"),
      items: [
        {
          key: "payg",
          label: t("config.payg.label", "Billing & usage"),
          icon: "speed-rounded",
          component: isLeader ? <PaygLeader /> : <PaygMember />,
        },
      ],
    },
  ];
}

export function createSaasConfigNavSections(
  Overview: OverviewComponent,
  onLogoutClick: () => void,
  {
    isDev = false,
    isAnonymous = false,
    paygEnabled = false,
    isLeader = false,
    t,
  }: CreateSaasConfigNavSectionsOptions,
): ConfigNavSection[] {
  const baseSections = createCoreConfigNavSections(false, false, false);

  // Create Account section as the first section with Overview and Passwords & Security
  const accountSection: ConfigNavSection = {
    title: t("config.account.overview.title", "Account Settings"),
    items: [
      {
        key: "overview",
        label: t("config.account.overview.label", "Overview"),
        icon: "account-circle",
        component: <Overview onLogoutClick={onLogoutClick} />,
      },
      {
        key: "security",
        label: "Passwords & Security",
        icon: "lock",
        component: <PasswordSecurity />,
      },
    ],
  };

  let sections = [accountSection, ...baseSections];

  // Suppress OSS-only sections (update checker, login config banner) not relevant in SaaS
  sections = sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.key === "general"
        ? {
            ...item,
            component: <GeneralSection hideUpdateSection hideAdminBanner />,
          }
        : item,
    ),
  }));

  sections = ensurePreferencesSection(sections);
  sections = appendDeveloperSection(sections);

  if (!isAnonymous) {
    sections = appendBillingSection(sections, t);
    if (paygEnabled) {
      sections = appendPaygSection(sections, t, isLeader);
    }
  }

  if (isDev) {
    console.debug("[AppConfigModal] SaaS navigation sections", sections);
  }

  return sections;
}
