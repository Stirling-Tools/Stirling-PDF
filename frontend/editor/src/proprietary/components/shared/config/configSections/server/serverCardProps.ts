import type {
  EndpointsSettingsData,
  FolderAccessSettingsData,
  GeneralSettingsData,
  McpSettingsData,
  StorageSharingSettingsData,
  UiDefaultsSettingsData,
} from "@app/components/shared/config/configSections/server/serverSettings";

/**
 * What every System card needs from the page that owns them. The six server
 * rows shared one Save bar's worth of state, so the merged page keeps the
 * drafts and hands each card the one slice it edits rather than letting each
 * card fetch and save on its own.
 */
export interface ServerCardProps<T> {
  settings: T;
  setSettings: (next: T) => void;
  /** True while the backend still lists this key as awaiting a restart. */
  isFieldPending: (field: string) => boolean;
  loginEnabled: boolean;
}

export type GeneralCardProps = ServerCardProps<GeneralSettingsData>;
export type UiDefaultsCardProps = ServerCardProps<UiDefaultsSettingsData>;
export type EndpointsCardProps = ServerCardProps<EndpointsSettingsData>;
export type StorageSharingCardProps =
  ServerCardProps<StorageSharingSettingsData>;
export type McpCardProps = ServerCardProps<McpSettingsData>;

/**
 * The "add a root" box is page state: Discard clears it alongside the draft,
 * exactly as the standalone section did.
 */
export interface FolderAccessCardProps extends ServerCardProps<FolderAccessSettingsData> {
  newRoot: string;
  setNewRoot: (value: string) => void;
}
