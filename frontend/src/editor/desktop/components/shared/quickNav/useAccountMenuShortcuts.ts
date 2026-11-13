import { useAccountMenuShortcuts as useServerAccountMenuShortcuts } from "@editor-proprietary/components/shared/quickNav/useAccountMenuShortcuts";
import { useConnectionMode } from "@editor/hooks/useConnectionMode";
import type { QuickNavAccountShortcut } from "@editor/contexts/QuickNavHostContext";

const CLOUD_SECTIONS = new Set(["about", "billing"]);

export function useAccountMenuShortcuts(): QuickNavAccountShortcut[] {
  const shortcuts = useServerAccountMenuShortcuts();
  const mode = useConnectionMode();
  if (mode !== "saas") return shortcuts;
  return shortcuts.filter((shortcut) => CLOUD_SECTIONS.has(shortcut.id));
}
