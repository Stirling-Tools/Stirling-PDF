import { NavKey } from "@app/components/shared/config/types";

/**
 * A single, searchable setting *row* inside the settings modal.
 *
 * The existing in-modal SettingsSearchBar searches section content but can only
 * navigate to a whole section. This index lets the global super search deep-link
 * to an individual control: navigating to `/settings/{section}?focus={anchor}`,
 * where `anchor` is the DOM `id` placed on that control's row (see
 * AppConfigModal's focus-scroll effect and the `id=` attributes added to the
 * matching section components).
 */
export interface SettingsSearchEntry {
  /** Settings section this row lives in (nav key, e.g. "general"). */
  section: NavKey;
  /** DOM id on the control's row; used as the `?focus=` anchor. */
  anchor: string;
  /** i18n key for the display label. */
  labelKey: string;
  /** English fallback / default for the label. */
  labelFallback: string;
  /** Extra English terms to match against (synonyms, related words). */
  keywords?: string[];
}

/**
 * Curated row-level entries for the high-value, user-facing settings sections.
 * Section-level results (every other tab) come from the nav sections directly,
 * so this list only needs the rows worth jumping straight to.
 */
export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // --- General > Appearance ---
  {
    section: "general",
    anchor: "setting-theme",
    labelKey: "settings.general.theme",
    labelFallback: "Theme",
    keywords: ["dark", "light", "mode", "appearance", "colour", "color"],
  },
  {
    section: "general",
    anchor: "setting-language",
    labelKey: "settings.general.language",
    labelFallback: "Language",
    keywords: ["locale", "translation", "i18n"],
  },
  // --- General > Behaviour ---
  {
    section: "general",
    anchor: "setting-tool-picker-mode",
    labelKey: "settings.general.defaultToolPickerMode",
    labelFallback: "Default tool picker mode",
    keywords: ["sidebar", "fullscreen", "tools", "panel"],
  },
  {
    section: "general",
    anchor: "setting-startup-view",
    labelKey: "settings.general.defaultStartupView",
    labelFallback: "Default view on launch",
    keywords: ["startup", "launch", "home", "reader", "automate"],
  },
  {
    section: "general",
    anchor: "setting-reader-zoom",
    labelKey: "settings.general.defaultViewerZoom",
    labelFallback: "Default reader zoom",
    keywords: ["zoom", "viewer", "fit width", "fit page", "magnification"],
  },
  {
    section: "general",
    anchor: "setting-hide-unavailable-tools",
    labelKey: "settings.general.hideUnavailableTools",
    labelFallback: "Hide unavailable tools",
    keywords: ["disabled", "greyed", "tools"],
  },
  {
    section: "general",
    anchor: "setting-hide-unavailable-conversions",
    labelKey: "settings.general.hideUnavailableConversions",
    labelFallback: "Hide unavailable conversions",
    keywords: ["disabled", "convert", "conversions"],
  },
  {
    section: "general",
    anchor: "setting-auto-unzip",
    labelKey: "settings.general.autoUnzip",
    labelFallback: "Auto-unzip API responses",
    keywords: ["zip", "extract", "unzip", "archive"],
  },
  {
    section: "general",
    anchor: "setting-auto-unzip-file-limit",
    labelKey: "settings.general.autoUnzipFileLimit",
    labelFallback: "Auto-unzip file limit",
    keywords: ["zip", "limit", "files", "extract"],
  },
  // --- Keyboard Shortcuts ---
  {
    section: "hotkeys",
    anchor: "setting-hotkeys-search",
    labelKey: "settings.hotkeys.title",
    labelFallback: "Keyboard Shortcuts",
    keywords: ["hotkey", "shortcut", "keybinding", "keyboard"],
  },
];
