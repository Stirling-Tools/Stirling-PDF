import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader } from "@mantine/core";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";
import {
  SweepRunWall,
  type SweepWallCard,
} from "@app/components/policies/SweepRunWall";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFolders } from "@app/contexts/FolderContext";
import { useAllFiles } from "@app/contexts/FileContext";
import { getDownloadsDirectory } from "@app/services/downloadsDirectory";
import {
  canListDirectory,
  listDirectory,
  readDiskFile,
  type DiskFileEntry,
} from "@app/services/localFolderContents";
import { useServerProcessingBlock } from "@app/hooks/useServerProcessingBlock";
import type { FileId, StirlingFileStub } from "@app/types/fileContext";
import apiClient from "@app/services/apiClient";
import "@app/components/policies/DownloadsProcessingWizard.css";

type Phase = "asking" | "working" | "done" | "failed";

/** Newest PDFs one offer takes on. Matches the server sweep's own cap, so the number the offer
 *  has always shown does not move. */
const SCAN_LIMIT = 100;

/** Files read at once. readDiskFile holds each file's bytes twice while building the File, so
 *  the whole folder must not be read in one go. */
const READ_BATCH = 4;

interface DownloadsProcessingWizardProps {
  /** Renders nothing until true, so the offer never competes with a first load. */
  active?: boolean;
}

interface FoundDownloads {
  directory: string;
  /** Newest first, so a capped offer takes the files the user most likely wants. */
  entries: DiskFileEntry[];
}

/**
 * Offers to classify the PDFs already in the user's Downloads folder.
 *
 * The folder is read here, on the machine: a connected server has no user Downloads directory to
 * look in, which is why this surface reads the disk itself. Everything after the read is the
 * ordinary upload path — the browser heuristic classifies each file, and only the files it is
 * unsure about escalate to the connected server's AI engine.
 *
 * The files on disk are never modified; reading them into the workspace is the whole job.
 */
export function DownloadsProcessingWizard({
  active = true,
}: DownloadsProcessingWizardProps) {
  const { t } = useTranslation();
  const [found, setFound] = useState<FoundDownloads | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("asking");
  const [error, setError] = useState<string | null>(null);
  /** Workspace ids this run took on; their stubs carry the verdict as it arrives. */
  const [trackedIds, setTrackedIds] = useState<FileId[]>([]);
  /** Names still waiting to be read, so the wall shows the whole job from the first frame. */
  const [queued, setQueued] = useState<string[]>([]);
  const [unreadable, setUnreadable] = useState(0);
  // Set when the user cancels; the read loop checks it between batches.
  const cancelRequested = useRef(false);
  const { addFiles } = useFileHandler();
  const { mountLocalFolder } = useFolders();
  const { fileStubs } = useAllFiles();
  const block = useServerProcessingBlock();

  // Only offer where it can work: a server must be connected to classify and meter, and the
  // build must be able to read the disk. No retry loop — every question here is answered by the
  // local filesystem, which does not become reachable later.
  useEffect(() => {
    if (!active || block || !canListDirectory) return;
    let cancelled = false;

    void (async () => {
      const directory = await getDownloadsDirectory();
      if (cancelled || !directory) return;
      const listing = await listDirectory(directory).catch(() => null);
      if (cancelled || !listing) return;
      const pdfs = listing.files
        .filter((entry) => entry.name.toLowerCase().endsWith(".pdf"))
        .sort((a, b) => b.lastModified - a.lastModified);
      if (pdfs.length === 0) return;
      setFound({ directory, entries: pdfs });
      // Warm the AI engine while the user reads the offer, so the first escalation pays no
      // cold start. Best-effort.
      void apiClient.get("/api/v1/ai/health").catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [active, block]);

  /** Closing resets to the question, so the offer can be reopened and re-run. */
  const close = () => {
    setOpen(false);
    setPhase("asking");
    setError(null);
    setTrackedIds([]);
    setQueued([]);
    setUnreadable(0);
  };

  const cancelSweep = () => {
    cancelRequested.current = true;
    close();
  };

  const tracked = useMemo<StirlingFileStub[]>(() => {
    const byId = new Map(fileStubs.map((stub) => [stub.id, stub]));
    return trackedIds
      .map((id) => byId.get(id))
      .filter((stub): stub is StirlingFileStub => stub != null);
  }, [fileStubs, trackedIds]);

  // A verdict, including a deliberate "nothing found" empty array, means that file is done.
  const classified = tracked.filter(
    (stub) => stub.classificationLabels !== undefined,
  ).length;

  const cards = useMemo<SweepWallCard[]>(
    () => [
      ...tracked.map((stub) => ({
        name: stub.name,
        state:
          stub.classificationLabels === undefined
            ? ("running" as const)
            : ("done" as const),
        labels: stub.classificationLabels ?? [],
      })),
      ...queued.map((name) => ({
        name,
        state: "pending" as const,
        labels: [],
      })),
    ],
    [tracked, queued],
  );

  const approve = async () => {
    if (!found) return;
    cancelRequested.current = false;
    setPhase("working");
    setUnreadable(0);
    const batch = found.entries.slice(0, SCAN_LIMIT);
    setQueued(batch.map((entry) => entry.name));

    try {
      // readDiskFile refuses a path outside a mounted directory, so the mount comes first. It
      // also puts Downloads in the file manager, which is where the user looks next.
      const segments = found.directory.split(/[/\\]/).filter(Boolean);
      await mountLocalFolder(
        found.directory,
        segments[segments.length - 1] ?? found.directory,
      );

      for (let index = 0; index < batch.length; index += READ_BATCH) {
        if (cancelRequested.current) return;
        const slice = batch.slice(index, index + READ_BATCH);
        const read = await Promise.all(
          slice.map((entry) => readDiskFile(entry).catch(() => null)),
        );
        const files = read.filter((file): file is File => file != null);
        if (files.length < slice.length) {
          setUnreadable((count) => count + (slice.length - files.length));
        }
        if (files.length > 0) {
          // selectFiles:false: a couple of dozen auto-selected files would take the workbench
          // away from whatever the user was doing.
          const added = await addFiles(files, { selectFiles: false });
          setTrackedIds((prev) => [
            ...prev,
            ...added.map((file) => file.fileId),
          ]);
        }
        const names = new Set(slice.map((entry) => entry.name));
        setQueued((prev) => prev.filter((name) => !names.has(name)));
      }
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  };

  const typesFound = useMemo(() => {
    const ids = new Set<string>();
    for (const card of cards) {
      for (const label of card.labels) ids.add(label);
    }
    return ids.size;
  }, [cards]);

  if (!found) return null;

  const capped = found.entries.length > SCAN_LIMIT;
  const total = Math.min(found.entries.length, SCAN_LIMIT);
  const settled = classified + unreadable;
  const outstanding = tracked.length - classified;

  if (!open) {
    return (
      <div className="downloads-wizard__trigger">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
          leftSection={<FolderSpecialIcon fontSize="small" />}
        >
          {t("processingFolders.downloads.trigger", {
            count: found.entries.length,
            defaultValue: "Process {{count}} PDFs in Downloads",
          })}
        </Button>
      </div>
    );
  }

  const wall = cards.length > 0 && <SweepRunWall cards={cards} />;

  return (
    <Modal
      open
      // Closing hides the modal while the reads carry on; reopening shows progress.
      onClose={phase === "working" ? () => setOpen(false) : close}
      width={phase === "asking" ? "sm" : "lg"}
      title={
        <span className="downloads-wizard__title">
          <FolderSpecialIcon fontSize="small" />
          {t("processingFolders.downloads.title", "Organise your Downloads?")}
        </span>
      }
      footer={
        <div className="downloads-wizard__foot">
          {phase === "asking" && (
            <>
              <Button variant="tertiary" size="sm" onClick={close}>
                {t("processingFolders.downloads.notNow", "Not now")}
              </Button>
              <Button size="sm" onClick={() => void approve()}>
                {t(
                  "processingFolders.downloads.approve",
                  "Process my Downloads",
                )}
              </Button>
            </>
          )}
          {phase === "working" && (
            <>
              <Button variant="tertiary" size="sm" onClick={cancelSweep}>
                {t("processingFolders.downloads.cancelSweep", "Cancel")}
              </Button>
              <Button size="sm" disabled loading>
                {t("processingFolders.downloads.working", "Processing...")}
              </Button>
            </>
          )}
          {(phase === "done" || phase === "failed") && (
            <Button size="sm" onClick={close}>
              {t("processingFolders.downloads.close", "Done")}
            </Button>
          )}
        </div>
      }
    >
      {phase === "asking" && (
        <div className="downloads-wizard__body">
          <p>
            {t("processingFolders.downloads.explain", {
              count: total,
              defaultValue:
                "Stirling can classify the {{count}} PDFs already in your Downloads folder and open the results here.",
            })}
          </p>
          <p className="downloads-wizard__path">{found.directory}</p>
          <ul className="downloads-wizard__facts">
            <li>
              {t(
                "processingFolders.downloads.notModified",
                "Your files in Downloads are not changed - Stirling reads them and opens them here.",
              )}
            </li>
            {capped && (
              <li>
                {t("processingFolders.downloads.capped", {
                  limit: SCAN_LIMIT,
                  found: found.entries.length,
                  defaultValue:
                    "You have {{found}} PDFs; the first {{limit}} are processed now and the rest follow.",
                })}
              </li>
            )}
          </ul>
        </div>
      )}

      {phase === "working" && (
        <div className="downloads-wizard__body">
          <p className="downloads-wizard__counts">
            <strong>{settled}</strong>{" "}
            {t("processingFolders.downloads.progressCounts", {
              total,
              defaultValue: "of {{total}} processed",
            })}
            {typesFound > 0 && (
              <>
                {" · "}
                {t("processingFolders.downloads.typesFound", {
                  count: typesFound,
                  defaultValue: "{{count}} document types found",
                })}
              </>
            )}
          </p>
          <div className="downloads-wizard__bar" role="progressbar">
            <span
              style={{
                width: `${total === 0 ? 0 : Math.round((settled / total) * 100)}%`,
              }}
            />
          </div>
          {wall || (
            <div className="downloads-wizard__progress">
              <Loader size="sm" />
            </div>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="downloads-wizard__body">
          <p className="downloads-wizard__counts">
            <CheckCircleIcon
              className="downloads-wizard__tick"
              fontSize="inherit"
            />{" "}
            {tracked.length === 0
              ? t("processingFolders.downloads.nothingNew", {
                  count: 0,
                  defaultValue:
                    "Nothing new to process - these {{count}} files have already been through.",
                })
              : t("processingFolders.downloads.finished", {
                  count: classified,
                  opened: tracked.length,
                  defaultValue:
                    "Classified {{count}} files and opened {{opened}} of them here, ready to work on.",
                })}
            {typesFound > 0 && (
              <>
                {" · "}
                {t("processingFolders.downloads.typesFound", {
                  count: typesFound,
                  defaultValue: "{{count}} document types found",
                })}
              </>
            )}
          </p>
          {unreadable > 0 && (
            <p className="downloads-wizard__warn">
              {t("processingFolders.downloads.someFailed", {
                count: unreadable,
                defaultValue:
                  "{{count}} could not be processed and were left untouched.",
              })}
            </p>
          )}
          {outstanding > 0 && (
            <p className="downloads-wizard__warn">
              {t(
                "processingFolders.downloads.stillRunning",
                "Some files are still being processed in the background.",
              )}
            </p>
          )}
          {wall}
        </div>
      )}

      {phase === "failed" && (
        <div className="downloads-wizard__body">
          <p className="downloads-wizard__warn">
            {error ??
              t(
                "processingFolders.downloads.failed",
                "Could not set that up. Your files have not been changed.",
              )}
          </p>
        </div>
      )}
    </Modal>
  );
}
