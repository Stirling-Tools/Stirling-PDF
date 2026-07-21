import React from "react";
import { useTranslation } from "react-i18next";
import HotkeysSection from "@app/components/shared/config/configSections/HotkeysSection";
import GeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import HelpSection from "@app/components/shared/config/configSections/HelpSection";
import LegalSection from "@app/components/shared/config/configSections/LegalSection";
import {
  BackendThirdPartyLicensesSection,
  FrontendThirdPartyLicensesSection,
} from "@app/components/shared/config/configSections/ThirdPartyLicensesSection";
import type {
  ConfigNavItem,
  ConfigNavSection,
} from "@app/components/shared/config/types";

// Re-exported for the many existing importers; the definitions live in
// config/types so type-only consumers don't pull the section tree in.
export type { ConfigNavItem, ConfigNavSection };

export interface ConfigColors {
  navBg: string;
  sectionTitle: string;
  navItem: string;
  navItemActive: string;
  navItemActiveBg: string;
  contentBg: string;
  headerBorder: string;
}

export const useConfigNavSections = (
  _isAdmin: boolean = false,
  _runningEE: boolean = false,
  _loginEnabled: boolean = false,
  onRequestClose: () => void = () => {},
  _showSettingsWhenNoLogin: boolean = true,
): ConfigNavSection[] => {
  const { t } = useTranslation();

  const sections: ConfigNavSection[] = [
    {
      title: t("settings.preferences.title", "Preferences"),
      items: [
        {
          key: "general",
          label: t("settings.general.title", "General"),
          icon: "settings-rounded",
          component: <GeneralSection />,
        },
        {
          key: "hotkeys",
          label: t("settings.hotkeys.title", "Keyboard Shortcuts"),
          icon: "keyboard-rounded",
          component: <HotkeysSection />,
        },
      ],
    },
    {
      title: t("settings.help.title", "Help"),
      items: [
        {
          key: "help",
          label: t("settings.help.label", "Tours"),
          icon: "help-rounded",
          component: (
            <HelpSection isAdmin={_isAdmin} onRequestClose={onRequestClose} />
          ),
        },
      ],
    },
    {
      title: t("settings.legal.title", "Legal"),
      items: [
        {
          key: "legal",
          label: t("settings.legal.label", "Legal"),
          icon: "gavel-rounded",
          component: <LegalSection />,
        },
        {
          key: "backendThirdPartyLicenses",
          label: t("settings.licenses.backendLabel", "Backend Licenses"),
          icon: "article-rounded",
          component: <BackendThirdPartyLicensesSection />,
        },
        {
          key: "frontendThirdPartyLicenses",
          label: t("settings.licenses.frontendLabel", "Frontend Licenses"),
          icon: "code-rounded",
          component: <FrontendThirdPartyLicensesSection />,
        },
      ],
    },
  ];

  return sections;
};

// Deprecated: Use useConfigNavSections hook instead
export const createConfigNavSections = (
  _isAdmin: boolean = false,
  _runningEE: boolean = false,
  _loginEnabled: boolean = false,
): ConfigNavSection[] => {
  console.warn(
    "createConfigNavSections is deprecated. Use useConfigNavSections hook instead for proper i18n support.",
  );
  const sections: ConfigNavSection[] = [
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

  return sections;
};
