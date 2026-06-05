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

/**
 * A whole settings section (nav tab). Used by the super search to offer
 * section-level results for tabs that don't have curated row entries.
 *
 * Kept as a static list (rather than importing `useConfigNavSections`) so the
 * always-mounted top bar doesn't pull the heavy settings component tree into
 * the main bundle — that tree is deliberately lazy-loaded via AppConfigModalLazy.
 * Visibility mirrors the modal's own gating via the flags below.
 */
export interface SettingsSectionEntry {
  key: NavKey;
  labelKey: string;
  labelFallback: string;
  keywords?: string[];
  /** Only surface when the user is logged in. */
  requiresLogin?: boolean;
  /** Only surface for admins. */
  adminOnly?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSectionEntry[] = [
  {
    key: "general",
    labelKey: "settings.general.title",
    labelFallback: "General",
    keywords: ["theme", "language", "appearance", "preferences"],
  },
  {
    key: "hotkeys",
    labelKey: "settings.hotkeys.title",
    labelFallback: "Keyboard Shortcuts",
    keywords: ["hotkey", "shortcut", "keybinding"],
  },
  {
    key: "account",
    labelKey: "account.title",
    labelFallback: "Account",
    keywords: ["profile", "email", "password", "user"],
    requiresLogin: true,
  },
  {
    key: "security",
    labelKey: "settings.security.title",
    labelFallback: "Security",
    keywords: ["password", "2fa", "authentication", "sessions"],
    requiresLogin: true,
  },
  {
    key: "connections",
    labelKey: "settings.connection.title",
    labelFallback: "Connections",
    keywords: ["google drive", "integrations", "oauth"],
    requiresLogin: true,
  },
  {
    key: "plan",
    labelKey: "settings.planBilling.title",
    labelFallback: "Plan & Billing",
    keywords: ["billing", "subscription", "upgrade", "payment", "invoice"],
    requiresLogin: true,
  },
  {
    key: "api-keys",
    labelKey: "settings.developer.apiKeys.title",
    labelFallback: "API Keys",
    keywords: ["api", "token", "developer", "key"],
    requiresLogin: true,
  },
  {
    key: "help",
    labelKey: "settings.help.title",
    labelFallback: "Help",
    keywords: ["tour", "guide", "support", "docs"],
  },
];
