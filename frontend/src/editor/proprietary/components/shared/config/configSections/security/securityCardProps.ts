import type { useLoginRequired } from "@app/hooks/useLoginRequired";
import type {
  ConnectionsSettingsData,
  LegalSettingsData,
  PrivacySettingsData,
  SecuritySettingsData,
} from "@app/components/shared/config/configSections/security/securitySettingsTypes";

export type GetDisabledStyles = ReturnType<
  typeof useLoginRequired
>["getDisabledStyles"];

/**
 * What every card on the merged security page needs from the page that owns
 * them. This page is a composite of four backend sections, so a card gets the
 * slice of the draft its own sub-fetch owns rather than fetching for itself.
 */
export interface SettingsCardProps<T> {
  settings: T;
  setSettings: (next: T) => void;
  /** True while the backend still lists this key as awaiting a restart. */
  isFieldPending: (field: string) => boolean;
  loginEnabled: boolean;
  getDisabledStyles: GetDisabledStyles;
}

export type SecurityCardProps = SettingsCardProps<SecuritySettingsData>;
export type ConnectionsCardProps = SettingsCardProps<ConnectionsSettingsData>;
export type PrivacyCardProps = SettingsCardProps<PrivacySettingsData>;
export type LegalCardProps = SettingsCardProps<LegalSettingsData>;
