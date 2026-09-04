import { NavKey } from "@app/components/shared/config/types";

/**
 * A single, searchable setting *row* inside the settings modal.
 *
 * Section-level content matching (settingsContentSearch) only navigates to a
 * whole section; this index lets the global super search deep-link to an
 * individual control: navigating to `/settings/{section}?focus={anchor}`,
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
  // --- About: one row per card the four folded rows became, carrying the
  // labels and search terms those rows had.
  {
    section: "about",
    anchor: "help",
    labelKey: "settings.help.label",
    labelFallback: "Tours",
    keywords: ["tour", "walkthrough", "guide", "onboarding", "help"],
  },
  {
    section: "about",
    anchor: "legal",
    labelKey: "settings.legal.label",
    labelFallback: "Legal",
    keywords: ["terms", "privacy", "policy", "cookie", "consent", "gdpr"],
  },
  {
    section: "about",
    anchor: "frontendThirdPartyLicenses",
    labelKey: "settings.licenses.frontendLabel",
    labelFallback: "Frontend Licenses",
    keywords: [
      "licence",
      "license",
      "attribution",
      "dependencies",
      "open source",
    ],
  },
  {
    section: "about",
    anchor: "backendThirdPartyLicenses",
    labelKey: "settings.licenses.backendLabel",
    labelFallback: "Backend Licenses",
    keywords: [
      "licence",
      "license",
      "attribution",
      "dependencies",
      "open source",
    ],
  },
  // --- AI engine: one row per card the four folded rows became.
  {
    section: "adminAi",
    anchor: "adminAiGeneral",
    labelKey: "admin.settings.ai.general.connection",
    labelFallback: "Connection",
    keywords: ["ai", "engine", "url", "timeout", "enable", "connection"],
  },
  {
    section: "adminAi",
    anchor: "adminAiCapabilities",
    labelKey: "admin.settings.ai.general.capabilities.title",
    labelFallback: "Capabilities",
    keywords: ["chat", "features", "classify", "math", "comment"],
  },
  {
    section: "adminAi",
    anchor: "adminAiModels",
    labelKey: "settings.ai.models",
    labelFallback: "Models & Providers",
    keywords: ["llm", "openai", "anthropic", "ollama", "model", "provider"],
  },
  {
    section: "adminAi",
    anchor: "adminAiDocuments",
    labelKey: "settings.ai.documents",
    labelFallback: "Documents & RAG",
    keywords: ["rag", "embedding", "retrieval", "vector", "index", "search"],
  },
  {
    section: "adminAi",
    anchor: "adminAiLimits",
    labelKey: "settings.ai.limits",
    labelFallback: "Limits & Performance",
    keywords: ["tokens", "rate", "concurrency", "guardrail", "performance"],
  },
  // --- Anchors for the rows the folds retired; each lands on its host card.
  {
    section: "general",
    anchor: "hotkeys",
    labelKey: "settings.hotkeys.title",
    labelFallback: "Keyboard Shortcuts",
    keywords: ["hotkey", "shortcut", "keybinding", "keyboard"],
  },
  {
    section: "general",
    anchor: "account",
    labelKey: "account.accountSettings",
    labelFallback: "Account",
    keywords: [
      "account",
      "password",
      "username",
      "profile",
      "mfa",
      "two factor",
    ],
  },
  {
    section: "adminGeneral",
    anchor: "adminEndpoints",
    labelKey: "settings.configuration.endpoints",
    labelFallback: "Endpoints",
    keywords: ["endpoint", "api", "routes", "disable tool"],
  },
  {
    section: "adminGeneral",
    anchor: "adminStorageSharing",
    labelKey: "settings.configuration.storageSharing",
    labelFallback: "File Storage & Sharing",
    keywords: ["storage", "sharing", "share link", "quota"],
  },
  {
    section: "adminGeneral",
    anchor: "adminFolderAccess",
    labelKey: "settings.configuration.folderAccess",
    labelFallback: "Folder Access",
    keywords: ["folder", "directory", "path", "allowlist"],
  },
  {
    section: "adminGeneral",
    anchor: "adminFeatures",
    labelKey: "settings.configuration.features",
    labelFallback: "Server certificate",
    keywords: ["certificate", "signing", "sign with stirling"],
  },
  {
    section: "adminGeneral",
    anchor: "adminMcp",
    labelKey: "settings.configuration.mcp",
    labelFallback: "MCP Server",
    keywords: ["mcp", "model context protocol", "tools"],
  },
  {
    section: "adminConnections",
    anchor: "adminConnections",
    labelKey: "settings.configuration.connections",
    labelFallback: "Single sign-on",
    keywords: ["sso", "saml", "oauth", "google", "keycloak", "smtp", "mail"],
  },
  {
    section: "adminLegal",
    anchor: "adminPrivacy",
    labelKey: "settings.configuration.privacy",
    labelFallback: "Privacy",
    keywords: ["privacy", "analytics", "tracking", "robots", "metrics"],
  },
  {
    section: "adminLegal",
    anchor: "adminLegal",
    labelKey: "settings.configuration.legal",
    labelFallback: "Legal documents",
    keywords: ["legal", "terms", "privacy policy", "cookie"],
  },
  {
    section: "adminSecurity",
    anchor: "auditLogging",
    labelKey: "settings.licensingAnalytics.audit",
    labelFallback: "Audit log",
    keywords: ["audit", "log", "retention", "events"],
  },
  {
    section: "adminDatabase",
    anchor: "adminDatabase",
    labelKey: "settings.configuration.database",
    labelFallback: "Database",
    keywords: ["database", "postgres", "h2", "backup", "restore", "datasource"],
  },
];
