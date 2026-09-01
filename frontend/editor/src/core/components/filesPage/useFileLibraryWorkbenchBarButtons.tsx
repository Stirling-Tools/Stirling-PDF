import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import RefreshIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import {
  useWorkbenchBarButtons,
  type WorkbenchBarButtonWithAction,
} from "@app/hooks/useWorkbenchBarButtons";

export interface FileLibraryWorkbenchBarButtonsOptions {
  onRefresh: () => void;
  refreshing: boolean;
  /** Set when refreshing needs a session the user does not have; also the tooltip. */
  refreshDisabledReason: ReactNode;
  onNewFolder: () => void;
  /** Set when the server ships no folder storage; also the tooltip. */
  newFolderDisabledReason: ReactNode;
  onUpload: () => void;
  onUploadFromMobile?: () => void;
}

/**
 * The library's own actions, in the bar every other view uses. It had a header of
 * its own carrying these plus a second search box, which read as two stacked bars.
 */
export function useFileLibraryWorkbenchBarButtons({
  onRefresh,
  refreshing,
  refreshDisabledReason,
  onNewFolder,
  newFolderDisabledReason,
  onUpload,
  onUploadFromMobile,
}: FileLibraryWorkbenchBarButtonsOptions): void {
  const { t } = useTranslation();

  const buttons = useMemo<WorkbenchBarButtonWithAction[]>(
    () => [
      {
        id: "fileLibraryRefresh",
        icon: <RefreshIcon />,
        tooltip:
          refreshDisabledReason ??
          t("filesPage.refresh", "Refresh from server"),
        ariaLabel: t("filesPage.refresh", "Refresh from server"),
        section: "top",
        order: 10,
        disabled: refreshing || Boolean(refreshDisabledReason),
        onClick: onRefresh,
      },
      {
        id: "fileLibraryNewFolder",
        icon: <CreateNewFolderIcon />,
        tooltip:
          newFolderDisabledReason ?? t("filesPage.newFolder", "New folder"),
        ariaLabel: t("filesPage.newFolder", "New folder"),
        section: "top",
        order: 20,
        disabled: Boolean(newFolderDisabledReason),
        onClick: onNewFolder,
      },
      {
        id: "fileLibraryUpload",
        icon: <UploadFileIcon />,
        tooltip: t("filesPage.upload", "Upload"),
        ariaLabel: t("filesPage.upload", "Upload"),
        section: "top",
        order: 30,
        onClick: onUpload,
      },
      // Only where a phone can pair with this session.
      ...(onUploadFromMobile
        ? [
            {
              id: "fileLibraryUploadFromMobile",
              icon: <QrCode2Icon />,
              tooltip: t("filesPage.uploadFromMobile", "Upload from Mobile"),
              ariaLabel: t("filesPage.uploadFromMobile", "Upload from Mobile"),
              section: "top" as const,
              order: 40,
              onClick: onUploadFromMobile,
            },
          ]
        : []),
    ],
    [
      t,
      onRefresh,
      refreshing,
      refreshDisabledReason,
      onNewFolder,
      newFolderDisabledReason,
      onUpload,
      onUploadFromMobile,
    ],
  );

  useWorkbenchBarButtons(buttons);
}
