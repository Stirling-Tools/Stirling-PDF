import type { AdvancedSettingsData } from "@app/components/shared/config/configSections/advanced/advancedSettings";

/**
 * What every card on the Advanced page needs from the page that owns them.
 * Advanced and Database were two rows over one `system` object, so the merged
 * page keeps a single draft and hands each card a slice of it.
 */
export interface AdvancedCardProps {
  settings: AdvancedSettingsData;
  setSettings: (next: AdvancedSettingsData) => void;
  /** True while the backend still lists this key as awaiting a restart. */
  isFieldPending: (field: string) => boolean;
  loginEnabled: boolean;
}
