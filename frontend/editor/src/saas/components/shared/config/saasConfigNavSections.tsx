import React from "react";
import { type TFunction } from "i18next";
import {
  createPreferencesNavSection,
  type ConfigNavSection,
} from "@core/components/shared/config/configNavSections";
import type { ConfigNavItem } from "@app/components/shared/config/types";
import PasswordSecurity from "@app/components/shared/config/configSections/PasswordSecurity";
import ApiKeys from "@app/components/shared/config/configSections/ApiKeys";
import McpSection from "@app/components/shared/config/configSections/McpSection";
import HelpSection from "@app/components/shared/config/configSections/HelpSection";
import LegalSection from "@app/components/shared/config/configSections/LegalSection";
import {
  createCloudBillingSection,
  createCloudTeamNavItem,
} from "@app/components/shared/config/cloudConfigNavSections";

type OverviewComponent = React.ComponentType<{ onLogoutClick: () => void }>;

interface CreateSaasConfigNavSectionsOptions {
  isAnonymous?: boolean;
  t: TFunction<"translation", undefined>;
  /** Leaves settings; the Help tours need the page out of the way to run. */
  onRequestClose?: () => void;
}

function appendDeveloperSection(
  sections: ConfigNavSection[],
  t: TFunction<"translation", undefined>,
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
      title: t("settings.developer.title", "Developer"),
      items: [
        {
          key: "api-keys",
          label: t("settings.developer.apiKeys", "API Keys"),
          icon: "key",
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

  // The Plan/Billing section is the shared cloud surface (wallet-driven PAYG
  // dashboard + spend cap), so both saas and desktop reference one source.
  return [...sections, createCloudBillingSection(t)];
}

// Add an "MCP Server" tab in the Developer section. Always shown in SaaS;
// purely informational, so it appears for anonymous users too.
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

  const mcpItem: ConfigNavItem = {
    key: "mcp" as const,
    label: t("config.mcp.navLabel", "MCP Server"),
    description: t(
      "config.mcp.description",
      "Model Context Protocol (MCP) lets AI assistants like Claude use your Stirling PDF tools directly. Connect a client once and your assistant can convert, edit, secure and process documents on your behalf.",
    ),
    icon: "bot",
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
      {
        title: t("settings.developer.title", "Developer"),
        items: [mcpItem],
      },
    ];
  }

  return sections.map((section, index) =>
    index === developerIndex
      ? { ...section, items: [...section.items, mcpItem] }
      : section,
  );
}

function appendHelpSection(
  sections: ConfigNavSection[],
  t: TFunction<"translation", undefined>,
  onRequestClose: () => void,
): ConfigNavSection[] {
  const hasHelp = sections.some((section) =>
    section.items.some((item) => item.key === "help"),
  );

  if (hasHelp) {
    return sections;
  }

  return [
    ...sections,
    {
      title: t("settings.help.title", "Help"),
      items: [
        {
          key: "help" as const,
          label: t("settings.help.label", "Tours"),
          icon: "circle-question-mark",
          component: (
            <HelpSection isAdmin={false} onRequestClose={onRequestClose} />
          ),
        },
      ],
    },
  ];
}

// Legal links (privacy policy, terms, etc.). Shown to anonymous users too —
// it's public information.
function appendLegalSection(
  sections: ConfigNavSection[],
  t: TFunction<"translation", undefined>,
): ConfigNavSection[] {
  const hasLegal = sections.some((section) =>
    section.items.some((item) => item.key === "legal"),
  );

  if (hasLegal) {
    return sections;
  }

  return [
    ...sections,
    {
      title: t("settings.legal.title", "Legal"),
      items: [
        {
          key: "legal" as const,
          label: t("settings.legal.label", "Legal"),
          icon: "gavel",
          component: <LegalSection />,
        },
      ],
    },
  ];
}

export function createSaasConfigNavSections(
  Overview: OverviewComponent,
  onLogoutClick: () => void,
  {
    isAnonymous = false,
    t,
    onRequestClose = () => {},
  }: CreateSaasConfigNavSectionsOptions,
): ConfigNavSection[] {
  // Create Account section as the first section with Overview and Passwords & Security
  const accountSection: ConfigNavSection = {
    title: t("config.account.overview.title", "Account Settings"),
    items: [
      {
        key: "overview",
        label: t("config.account.overview.label", "Overview"),
        icon: "circle-user",
        component: <Overview onLogoutClick={onLogoutClick} />,
      },
      {
        key: "security",
        label: t("config.account.security.title", "Passwords & Security"),
        icon: "lock",
        component: <PasswordSecurity />,
      },
    ],
  };

  if (!isAnonymous) {
    // Shared cloud team item — same management UI on saas and desktop.
    accountSection.items.push(createCloudTeamNavItem(t));
  }

  // Login is always on and there is no local binary to update, so the setup
  // banner and the update card stay off. Account lives in its own group above.
  let sections = [
    accountSection,
    createPreferencesNavSection(t, {
      hideAdminBanner: true,
      hideUpdateSection: true,
    }),
  ];
  sections = appendDeveloperSection(sections, t);
  sections = appendMcpSection(sections, t);

  if (!isAnonymous) {
    // The Plan tab is now the single billing surface — it internally branches
    // free vs subscribed × leader vs member via useWallet(). The old separate
    // "Pay-as-you-go" tab and paygEnabled / isLeader options were removed.
    sections = appendBillingSection(sections, t);
  }

  sections = appendHelpSection(sections, t, onRequestClose);
  sections = appendLegalSection(sections, t);

  return sections;
}
