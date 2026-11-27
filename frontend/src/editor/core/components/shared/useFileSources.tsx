import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { IconName } from "@editor/icons/icons";
import { useFilesModalContext } from "@editor/contexts/FilesModalContext";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import { useAllFiles } from "@editor/contexts/FileContext";
import { useFileManager } from "@editor/hooks/useFileManager";
import { useIsPhone } from "@editor/hooks/useIsMobile";
import { openFilesFromDisk } from "@editor/services/openFilesFromDisk";
import MobileUploadModal from "@editor/components/shared/MobileUploadModal";

export interface FileSource {
  key: string;
  icon: IconName;
  tileLabel: string;
  menuLabel: string;
  testId: string;
  onClick: () => void;
}

/**
 * The places files can come from, plus the hidden input and phone modal they
 * open. Render `pickers` wherever the sources are offered. A caller with its
 * own upload handling passes `onPickComputer` to take over the computer pick.
 */
export function useFileSources(onPickComputer?: () => void) {
  const { t } = useTranslation();
  const { openFilesModal, onFileUpload } = useFilesModalContext();
  const { config } = useAppConfig();
  const { selectedTool } = useToolWorkflow();
  const isPhone = useIsPhone();
  const { files: workbenchFiles } = useAllFiles();
  const { loadRecentFiles } = useFileManager();
  const [hasRecentFiles, setHasRecentFiles] = useState(false);
  const [mobileUploadOpen, setMobileUploadOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Re-checked as the workbench changes: an upload also lands in recents, and
  // the library source should appear without reopening the tool.
  useEffect(() => {
    const checkRecentFiles = async () => {
      try {
        const recentFiles = await loadRecentFiles();
        setHasRecentFiles(recentFiles.length > 0);
      } catch {
        setHasRecentFiles(false);
      }
    };
    void checkRecentFiles();
  }, [loadRecentFiles, workbenchFiles.length]);

  const openComputerFiles = async () => {
    const files = await openFilesFromDisk({
      multiple: true,
      onFallbackOpen: () => fileInputRef.current?.click(),
    });
    if (files.length > 0) void onFileUpload(files);
  };

  // Matches the files modal: the open tool's own inputs, or PDFs otherwise.
  const accept =
    selectedTool?.supportedFormats
      ?.map((format) => `.${format.replace(/^\./, "")}`)
      .join(",") ?? ".pdf,application/pdf";

  const handleFallbackSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) void onFileUpload(files);
    event.target.value = "";
  };

  // The library only appears once there is history to pick from, so a
  // first-time user sees the computer upload as the obvious path.
  const sources: FileSource[] = [
    {
      key: "computer",
      icon: "monitor",
      tileLabel: t("files.source.computer", "Computer"),
      menuLabel: t("files.source.fromComputer", "From computer"),
      testId: "add-files-from-computer",
      onClick: onPickComputer ?? (() => void openComputerFiles()),
    },
    ...(hasRecentFiles
      ? [
          {
            key: "library",
            icon: "library" as const,
            tileLabel: t("files.source.library", "Library"),
            menuLabel: t("files.source.fromLibrary", "From library"),
            testId: "add-files-from-library",
            onClick: () => openFilesModal({}),
          },
        ]
      : []),
    ...(config?.enableMobileScanner && !isPhone
      ? [
          {
            key: "phone",
            icon: "qr-code" as const,
            tileLabel: t("files.source.phone", "Phone"),
            menuLabel: t("files.source.fromPhone", "From phone"),
            testId: "add-files-from-phone",
            onClick: () => setMobileUploadOpen(true),
          },
        ]
      : []),
  ];

  const pickers = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleFallbackSelect}
        style={{ display: "none" }}
      />
      <MobileUploadModal
        opened={mobileUploadOpen}
        onClose={() => setMobileUploadOpen(false)}
        onFilesReceived={(files) => void onFileUpload(files)}
      />
    </>
  );

  return { sources, pickers };
}
