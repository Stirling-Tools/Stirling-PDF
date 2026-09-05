import type { ReactNode } from "react";
import type {
  ConfigNavSection,
  NavKey,
} from "@app/components/shared/config/types";

/**
 * What the settings page needs to draw itself. Lives apart from the hook that
 * builds it so a flavor's own builder can be typed against this without pulling
 * another flavor's section components into its build graph.
 */
export interface SettingsNav {
  sections: ConfigNavSection[];
  /** Flavor-owned overlays the page mounts (SaaS puts its sign-out confirm here). */
  overlay?: ReactNode;
  /**
   * Old section key -> the section that replaced it, for builds where one
   * surface supersedes another. Bookmarks and search results for the retired
   * key land on its replacement instead of an empty page.
   */
  aliases?: Partial<Record<string, NavKey>>;
}
