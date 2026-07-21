import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Center, Loader, Modal, Text } from "@mantine/core";

import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";
import { fileStorage } from "@app/services/fileStorage";
import { useFileActions } from "@app/contexts/file/fileHooks";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { useIndexedDBRevision } from "@app/contexts/IndexedDBContext";
import { VersionTimeline } from "@app/components/filesPage/VersionTimeline";

interface VersionHistoryModalProps {
  opened: boolean;
  onClose: () => void;
  /** The file whose version journey to show (the current/leaf version). */
  file: StirlingFileStub | null;
  /** Called after a destructive change so the launcher can refresh its list. */
  onChanged?: () => void;
}

/**
 * Self-contained modal that renders the same Version Journey timeline used in
 * the details panel. Loads the chain itself and wires view/open/remove to the
 * file context, so it can be opened from anywhere (sidebar or /files card).
 */
export function VersionHistoryModal({
  opened,
  onClose,
  file,
  onChanged,
}: VersionHistoryModalProps) {
  const { t } = useTranslation();
  const { actions: fileActions } = useFileActions();
  const { actions: navActions } = useNavigationActions();
  const dbRevision = useIndexedDBRevision();

  const [chain, setChain] = useState<StirlingFileStub[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!opened || !file) {
      setChain([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const rootId = (file.originalFileId ?? file.id) as FileId;
    fileStorage
      .getHistoryChainStubs(rootId)
      .then((c) => {
        if (!cancelled) setChain(c);
      })
      .catch((err) => {
        console.error("Failed to load version history", err);
        if (!cancelled) setChain([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // dbRevision so the chain refreshes after a version is removed.
  }, [opened, file, dbRevision]);

  const stubById = useCallback(
    (id: FileId) => chain.find((c) => c.id === id),
    [chain],
  );

  const handleAddToWorkspace = useCallback(
    (ids: FileId[]) => {
      const stubs = ids
        .map((id) => stubById(id))
        .filter((s): s is StirlingFileStub => Boolean(s));
      if (stubs.length === 0) return;
      void fileActions.addStirlingFileStubs(stubs);
      navActions.setWorkbench("fileEditor");
      onClose();
    },
    [stubById, fileActions, navActions, onClose],
  );

  const handleRemove = useCallback(
    async (ids: FileId[]) => {
      await fileActions.removeFiles(ids, true);
      onChanged?.();
      // If only one version remains there's no journey to show.
      const remaining = chain.filter((c) => !ids.includes(c.id));
      if (remaining.length <= 1) onClose();
    },
    [fileActions, chain, onChanged, onClose],
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="md"
      title={t("filesPage.field.versionHistory", "Version journey")}
    >
      {loading ? (
        <Center py="lg">
          <Loader size="sm" />
        </Center>
      ) : chain.length > 1 && file ? (
        <VersionTimeline
          chain={chain}
          currentId={file.id}
          onAddToWorkspace={handleAddToWorkspace}
          onRemove={handleRemove}
        />
      ) : (
        <Text size="sm" c="dimmed" py="sm">
          {t(
            "filesPage.versionHistoryEmpty",
            "This file has no earlier versions.",
          )}
        </Text>
      )}
    </Modal>
  );
}
