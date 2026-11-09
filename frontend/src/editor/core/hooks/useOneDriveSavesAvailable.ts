import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useConnectedAccounts } from "@editor/hooks/useConnectedAccounts";
import { getOneDriveConfig } from "@editor/services/oneDrivePickerService";

export function useOneDriveSavesAvailable(): boolean {
  const { config } = useAppConfig();
  const connected = useConnectedAccounts();
  return (
    getOneDriveConfig(config) !== null &&
    connected.available("microsoft") &&
    config?.microsoftAllowEditorSaves !== false
  );
}
