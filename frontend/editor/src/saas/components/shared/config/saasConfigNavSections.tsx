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

type OverviewComponent = React.ComponentType<{ onLogoutClick: () => void }>;

interface CreateSaasConfigNavSectionsOptions {
  isDev?: boolean;
  isAnonymous?: boolean;
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

export function createSaasConfigNavSections(
  Overview: OverviewComponent,
  onLogoutClick: () => void,
  { isDev = false, isAnonymous = false, t }: CreateSaasConfigNavSectionsOptions,
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
  }

  if (isDev) {
    console.debug("[AppConfigModal] SaaS navigation sections", sections);
  }

  return sections;
}
