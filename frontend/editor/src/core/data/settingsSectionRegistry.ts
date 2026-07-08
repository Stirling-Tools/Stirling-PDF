import { NavKey } from "@app/components/shared/config/types";

/**
 * A whole settings section (nav tab), described as pure data so the global
 * super search can offer section-level results.
 *
 * This is the single source of truth for *which settings sections are
 * searchable* in a given build. It is intentionally **component-free**: the
 * always-mounted top bar imports it (via `@app/data/settingsSectionRegistry`)
 * to feed the super search, and pulling the heavy settings component tree in
 * here would defeat the lazy-loaded settings modal (AppConfigModalLazy).
 *
 * Layering mirrors the nav builders (`configNavSections`): core lists the
 * always-present sections; higher layers shadow this module to add their own
 * (proprietary admin sections, saas cloud sections, …). A section only belongs
 * in a layer's registry if that layer's settings modal can actually render it —
 * otherwise search would deep-link to a tab that doesn't exist.
 *
 * Per-user visibility (admin / login) is expressed by the flags below and
 * applied by the super search at query time, mirroring the modal's own gating.
 */
export interface SettingsSectionEntry {
  /** Nav key; used for the `/settings/{key}` deep link. */
  key: NavKey;
  /** i18n key for the display label. */
  labelKey: string;
  /** English fallback / default for the label. */
  labelFallback: string;
  /** Extra English terms to match against (synonyms, related words). */
  keywords?: string[];
  /** Surface only when login mode is on (e.g. account, API keys). */
  requiresLogin?: boolean;
  /**
   * Admin-area section: the self-hosted modal surfaces it when the user is an
   * admin OR login mode is off (single-user self-host). Mirrors the proprietary
   * nav builder's `isAdmin || !loginEnabled` gate.
   */
  adminArea?: boolean;
}

/** Core (OSS) sections — always present in every build. */
export const SETTINGS_SECTION_REGISTRY: SettingsSectionEntry[] = [
  {
    key: "general",
    labelKey: "settings.general.title",
    labelFallback: "General",
    keywords: ["theme", "language", "appearance", "preferences", "startup"],
  },
  {
    key: "hotkeys",
    labelKey: "settings.hotkeys.title",
    labelFallback: "Keyboard Shortcuts",
    keywords: ["hotkey", "shortcut", "keybinding", "keyboard"],
  },
  {
    key: "help",
    labelKey: "settings.help.label",
    labelFallback: "Tours",
    keywords: ["help", "tour", "guide", "support", "docs"],
  },
  {
    key: "legal",
    labelKey: "settings.legal.label",
    labelFallback: "Legal",
    keywords: ["legal", "terms", "privacy", "licenses"],
  },
];
