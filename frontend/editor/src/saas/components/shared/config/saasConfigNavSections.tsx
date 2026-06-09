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
import McpSection from "@app/components/shared/config/configSections/McpSection";

type OverviewComponent = React.ComponentType<{ onLogoutClick: () => void }>;

interface CreateSaasConfigNavSectionsOptions {
  isDev?: boolean;
  isAnonymous?: boolean;
  /** When the server reports MCP is enabled, surface the MCP integration tab. */
  mcpEnabled?: boolean;
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

/**
 * When MCP is enabled on the server, add an "MCP Server" tab next to API Keys
 * in the Developer section (falling back to its own section if Developer is
 * somehow absent). The tab is purely informational - how to connect an AI
 * assistant - so it shows for anonymous users too.
 */
function appendMcpSection(
  sections: ConfigNavSection[],
  t: TFunction<"translation", undefined>,
): ConfigNavSection[] {
  const hasMcp = sections.some((section) =>
    section.items.some((item) => item.key === "mcp"),
  );

  if (hasMcp) {
    return sections;
  }

  const mcpItem = {
    key: "mcp" as const,
    label: t("config.mcp.navLabel", "MCP Server"),
    icon: "smart-toy-rounded",
    component: <McpSection />,
  };

  const developerIndex = sections.findIndex((section) =>
    section.items.some(
      (item) => item.key === "developer" || item.key === "api-keys",
    ),
  );

  if (developerIndex === -1) {
    return [
      ...sections,
      { title: "Developer", items: [mcpItem] },
    ];
  }

  return sections.map((section, index) =>
    index === developerIndex
      ? { ...section, items: [...section.items, mcpItem] }
      : section,
  );
}

export function createSaasConfigNavSections(
  Overview: OverviewComponent,
  onLogoutClick: () => void,
  {
    isDev = false,
    isAnonymous = false,
    mcpEnabled = false,
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

  if (mcpEnabled) {
    sections = appendMcpSection(sections, t);
  }

  if (!isAnonymous) {
    sections = appendBillingSection(sections, t);
  }

  if (isDev) {
    console.debug("[AppConfigModal] SaaS navigation sections", sections);
  }

  return sections;
}
