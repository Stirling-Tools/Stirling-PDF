import type { AiEngineSettingsData } from "@app/components/shared/config/configSections/aiEngineSettings";

/**
 * What every AI card needs from the page that owns them. The four AI sections
 * were one `aiEngine` object split across four rows, so the merged page keeps a
 * single draft and hands each card a slice of it rather than letting each card
 * fetch and save on its own.
 */
export interface AiCardProps {
  settings: AiEngineSettingsData;
  setSettings: (next: AiEngineSettingsData) => void;
  /** True while the backend still lists this key as awaiting a restart. */
  isFieldPending: (field: string) => boolean;
  loginEnabled: boolean;
}
