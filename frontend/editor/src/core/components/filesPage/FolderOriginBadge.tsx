import { useTranslation } from "react-i18next";
import { folderKind, type FolderRecord } from "@app/types/folder";
import { FileOriginBadge } from "@app/components/filesPage/FileOriginBadge";

/** Shows where a folder is stored, using the same origin marks as its files. */
export function FolderOriginBadge({ folder }: { folder: FolderRecord }) {
  const { t } = useTranslation();
  const kind = folderKind(folder);
  const tooltip =
    kind === "virtual"
      ? t(
          "filesPage.folderOrigin.virtualHint",
          "A folder that lives only in this browser",
        )
      : kind === "local"
        ? t(
            "filesPage.folderOrigin.diskHint",
            "A folder mounted from a directory on your disk",
          )
        : t(
            "filesPage.folderOrigin.serverHint",
            "A folder stored on the Stirling server",
          );
  return (
    <FileOriginBadge
      origin={kind === "server" ? "cloud" : "local"}
      tooltip={tooltip}
      compact
    />
  );
}
