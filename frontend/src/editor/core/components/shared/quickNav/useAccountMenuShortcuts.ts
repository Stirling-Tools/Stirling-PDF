import { useTranslation } from "react-i18next";
import { preferenceShortcuts } from "@editor/components/shared/quickNav/preferenceShortcuts";
import type { QuickNavAccountShortcut } from "@editor/contexts/QuickNavHostContext";

/**
 * The settings pages the avatar menu offers, for this build and this session.
 * A per-flavor seam: each build knows which sections it ships. A target the
 * session cannot see still lands safely, as the settings page falls back to
 * its first section.
 */
export function useAccountMenuShortcuts(): QuickNavAccountShortcut[] {
  const { t } = useTranslation();
  return preferenceShortcuts(t);
}
