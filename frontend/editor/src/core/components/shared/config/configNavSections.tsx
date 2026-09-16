import React from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import PreferencesSection from "@app/components/shared/config/configSections/preferences/PreferencesSection";
import GeneralSection from "@app/components/shared/config/configSections/GeneralSection";
import HotkeysSection from "@app/components/shared/config/configSections/HotkeysSection";
import AboutSection from "@app/components/shared/config/configSections/AboutSection";
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
      id: "preferences",
      title: t("settings.preferences.title", "Preferences"),
      items: [
        {
          key: "general",
          label: t("settings.general.title", "General"),
          description: t(
            "settings.preferences.description",
            "How the editor looks and behaves for you, and your account.",
          ),
          icon: "tune-rounded",
          component: <PreferencesSection />,
        },
      ],
    },
    // Reference material: read once and rarely revisited, so it is one page
    // rather than four rows you have to open in turn.
    {
      id: "about",
      title: t("settings.about.title", "About"),
      items: [
        {
          key: "about",
          label: t("settings.about.title", "About"),
          description: t(
            "settings.about.description",
            "Tours, legal documents and the licences of everything bundled with this build.",
          ),
          icon: "help-rounded",
          component: (
            <AboutSection isAdmin={_isAdmin} onRequestClose={onRequestClose} />
          ),
        },
      ],
    },
  ];

  return sections;
};

/**
 * The editor's own preference sections, for builders that are plain functions
 * rather than hooks (the cloud navs assemble their tree outside a component)
 * and so must be handed a `t` instead of calling useTranslation themselves.
 *
 * Replaces a hardcoded-English copy of this list: the SaaS nav was its only
 * caller, which is why "Preferences", "General" and "Keyboard Shortcuts" never
 * translated there.
 */
export const createConfigNavSections = (
  t: TFunction<"translation", undefined>,
): ConfigNavSection[] => [
  {
    id: "preferences",
    title: t("settings.preferences.title", "Preferences"),
    items: [
      {
        key: "general",
        label: t("settings.general.title", "General"),
        icon: "settings-rounded",
        component: <GeneralSection hideTitle />,
      },
      {
        key: "hotkeys",
        label: t("settings.hotkeys.title", "Keyboard Shortcuts"),
        icon: "keyboard-rounded",
        component: <HotkeysSection />,
      },
    ],
  },
];
