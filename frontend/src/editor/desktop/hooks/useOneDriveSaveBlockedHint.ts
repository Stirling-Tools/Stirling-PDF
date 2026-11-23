import { useTranslation } from "react-i18next";
import { useConnectedServer } from "@editor/hooks/useConnectedServer";
import { useOneDriveSavesAvailable } from "@editor/hooks/useOneDriveSavesAvailable";

export function useOneDriveSaveBlockedHint(): string | null {
  const { t } = useTranslation();
  const savesAvailable = useOneDriveSavesAvailable();
  const connectedServer = useConnectedServer();
  if (savesAvailable || connectedServer) return null;
  return t(
    "oneDriveSave.signInToSave",
    "Sign in to your server to save to OneDrive.",
  );
}
