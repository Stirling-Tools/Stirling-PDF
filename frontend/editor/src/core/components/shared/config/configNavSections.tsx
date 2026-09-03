import React from "react";
import { useTranslation } from "react-i18next";
import HotkeysSection from "@app/components/shared/config/configSections/HotkeysSection";
import GeneralSection from "@app/components/shared/config/configSections/GeneralSection";
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
            "settings.general.description",
            "Appearance, language and how the editor behaves by default.",
          ),
          icon: "settings-rounded",
          component: <GeneralSection hideTitle />,
        },
        {
          key: "hotkeys",
          label: t("settings.hotkeys.title", "Keyboard Shortcuts"),
          description: t(
            "settings.hotkeys.description",
            'Customize keyboard shortcuts for quick tool access. Click "Change shortcut" and press a new key combination. Press Esc to cancel.',
          ),
          icon: "keyboard-rounded",
          component: <HotkeysSection />,
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
      id: "preferences",
      title: "Preferences",
      items: [
        {
          key: "general",
          label: "General",
          icon: "settings-rounded",
          component: <GeneralSection hideTitle />,
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
