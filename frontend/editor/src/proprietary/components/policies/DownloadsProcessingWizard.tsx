import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader } from "@mantine/core";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";
import {
  CLASSIFY_OPERATION,
  cancelProcessingRuns,
  fetchDownloadsSuggestion,
  fetchMountedFiles,
  saveProcessingFolder,
  type DownloadsSuggestion,
} from "@app/services/processingFolderApi";
import { deliverSweepResults } from "@app/services/processingRunDelivery";
import {
  mergeRunsIntoCards,
  SweepRunWall,
  type SweepWallCard,
} from "@app/components/policies/SweepRunWall";
import { refreshProcessingFolders } from "@app/hooks/useProcessingFolders";
import { readClassificationLabelsFromFile } from "@app/services/fileClassification";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFolders } from "@app/contexts/FolderContext";
import { canListDirectory } from "@app/services/localFolderContents";
import apiClient from "@app/services/apiClient";
import "@app/components/policies/DownloadsProcessingWizard.css";

type Phase = "asking" | "working" | "done" | "failed";

interface DownloadsProcessingWizardProps {
  /** Renders nothing until true, so the offer never competes with a first load. */
  active?: boolean;
}

/**
 * Offers to process the PDFs already in the user's Downloads folder, then shows what it is doing.
 *
 * <p>Renders as a button; the offer opens on click. The server names its own Downloads directory
 * (the browser cannot see the machine's paths) and counts what is waiting; approving composes a
 * processing folder over it. The first sweep is capped server-side, and anything beyond the cap is
 * picked up by later sweeps rather than dropped.
 *
 * <p>While the sweep runs, the dialog is a wall of the actual documents — one card per file the
 * sweep took on, built from the runs feed itself so it never promises a file the sweep skipped.
 * Each card lights up as its run starts and flips to the document type the classifier discovered,
 * read from the delivered result's own metadata.
 */
export function DownloadsProcessingWizard({
  active = true,
}: DownloadsProcessingWizardProps) {
  const { t } = useTranslation();
  const [suggestion, setSuggestion] = useState<DownloadsSuggestion | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("asking");
  const [processed, setProcessed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Read once when the sweep settles: the sweep runs behind the create response,
  // so there are no upfront counts to show - the folder's own states close it out.
  const [summary, setSummary] = useState<{
    done: number;
    failed: number;
  } | null>(null);
  const [stalled, setStalled] = useState(false);
  const [opened, setOpened] = useState(0);
  const [cards, setCards] = useState<SweepWallCard[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  // Set when the user cancels; the delivery loop polls it and stands down.
  const cancelRequested = useRef(false);
  const { addFiles } = useFileHandler();
  const { mountLocalFolder } = useFolders();

  // Only offer where it can actually work: Downloads must exist, be a permitted folder root, and
  // have something in it worth processing.
  //
  // Asked repeatedly rather than once, because the window can open before the backend is
  // reachable — on a desktop install the app and its bundled server start together, and the UI
  // always wins that race. A single attempt would fail on every cold start and the offer would
  // simply never appear. Gives up after a bounded wait so an install where the answer is a
  // genuine "no" stops asking.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ask = () => {
      void fetchDownloadsSuggestion()
        .then((next) => {
          if (cancelled) return;
          if (next.available && next.pdfCount > 0) {
            setSuggestion(next);
            // Warm the AI engine while the user reads the offer, so the first
            // classify pays no cold start. Best-effort; the run would warm it
            // anyway, just visibly slower.
            void apiClient.get("/api/v1/ai/health").catch(() => {});
            return;
          }
          // A definite answer: Downloads is missing, not permitted, or empty. Nothing to wait for.
        })
        .catch(() => {
          // Backend not up yet, storage/folder access off, or not authenticated. Only the first of
          // those resolves itself, so retry a while before concluding there is no offer.
          if (cancelled || (attempts += 1) >= 20) return;
          timer = setTimeout(ask, 1500);
        });
    };
    ask();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active]);

  /** Closing resets to the question, so the offer can be reopened and re-run. */
  const close = () => {
    setOpen(false);
    setPhase("asking");
    setProcessed(0);
    setFailed(0);
    setError(null);
    setSummary(null);
    setStalled(false);
    setOpened(0);
    setCards([]);
    setActiveFolderId(null);
    cancelRequested.current = false;
  };

  /** Stop the sweep: stand the delivery loop down, cancel the runs, reset. */
  const cancelSweep = async () => {
    cancelRequested.current = true;
    if (activeFolderId) {
      await cancelProcessingRuns(activeFolderId).catch(() => {
        // The loop is already standing down; a failed cancel just lets the
        // remaining runs finish into a folder that is paused anyway.
      });
    }
    close();
  };

  /**
   * Deliver the sweep's results into the workbench as they settle, mirroring
   * the shared delivery's progress onto the card wall and the counts line.
   */
  const trackRuns = useCallback(
    async (policyId: string) => {
      await deliverSweepResults(policyId, null, addFiles, {
        isCancelled: () => cancelRequested.current,
        onProgress: (progress) => {
          setProcessed(progress.processed);
          setFailed(progress.failed);
          setOpened(progress.opened);
          if (progress.stalled) setStalled(true);
        },
        // The wall is built from the runs feed itself: one card per run the
        // sweep actually started, appearing on the first poll and switching
        // state as its run moves. Nothing here invents a file.
        onRuns: (runs) => {
          setCards((prev) => mergeRunsIntoCards(prev, runs));
        },
        // The reveal: read the discovered document type off the delivered
        // result's own metadata and flip it onto the card.
        onSettled: (settlement) => {
          const name = settlement.fileName?.trim();
          if (!name || settlement.failed || settlement.files.length === 0) {
            return;
          }
          void readClassificationLabelsFromFile(settlement.files[0]).then(
            (labels) => {
              if (!labels || labels.length === 0) return;
              setCards((prev) =>
                prev.map((card) =>
                  card.name === name ? { ...card, labels } : card,
                ),
              );
            },
          );
        },
      });
    },
    [addFiles],
  );

  const approve = async () => {
    if (!suggestion) return;
    cancelRequested.current = false;
    setPhase("working");
    try {
      // Born paused: the offer's promise is one sweep over what is already there.
      // Creation sweeps regardless of the flag (enabled only gates the watch), so
      // the trick still runs - but nothing keeps opening files as downloads land,
      // and the folder the user is left with reads as paused from the start.
      const folder = await saveProcessingFolder({
        directory: suggestion.directory,
        enabled: false,
        steps: [{ operation: CLASSIFY_OPERATION, parameters: {}, assets: {} }],
      });
      setActiveFolderId(folder.id);
      if (cancelRequested.current) {
        // Cancelled while the sweep was still being composed - a large folder's
        // scan takes a while, and the runs only exist now. Stop them here, or a
        // cancel clicked during the scan would be silently outlived.
        await cancelProcessingRuns(folder.id).catch(() => {});
        return;
      }
      // Mount the directory as a local folder too, so Downloads exists in the
      // file manager as a real folder — the processing record attaches to it
      // there — rather than results appearing from nowhere. Only where this
      // build can actually read the directory (the desktop app, where the
      // server's Downloads IS this machine's): a plain browser mounting the
      // server's path would show a folder that is forever empty. Idempotent,
      // and best-effort: the sweep's results matter more than the bookmark.
      if (canListDirectory) {
        const segments = suggestion.directory.split(/[/\\]/).filter(Boolean);
        await mountLocalFolder(
          suggestion.directory,
          segments[segments.length - 1] ?? suggestion.directory,
        ).catch(() => {});
      }
      // The new folder was created outside the hook's own actions; refresh the shared list so the
      // files page and any other consumer pick it up without a reload.
      void refreshProcessingFolders();
      // The sweep runs behind the create response; the wall builds itself from the
      // runs feed and the delivery stops when the runs settle (or none appear).
      await trackRuns(folder.id);
      // Close out from the folder's own per-file states - the one place that knows
      // how much was already done versus parked when nothing new ran.
      const states = await fetchMountedFiles(folder.id).catch(() => []);
      setSummary({
        done: states.filter((f) => f.state === "done").length,
        failed: states.filter((f) => f.state === "failed").length,
      });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  };

  /** Distinct document types discovered so far, for the counts line. */
  const typesFound = useMemo(() => {
    const ids = new Set<string>();
    for (const card of cards) {
      for (const label of card.labels) ids.add(label);
    }
    return ids.size;
  }, [cards]);

  if (!suggestion) return null;

  const capped = suggestion.pdfCount > suggestion.limit;
  const total = Math.min(suggestion.pdfCount, suggestion.limit);
  const sweepTotal = cards.length || total;
  const settled = processed + failed;

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
            count: suggestion.pdfCount,
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
      // Working stays dismissible: closing hides the modal while the sweep
      // carries on (the folder's own view tracks it); reopening shows progress.
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
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => void cancelSweep()}
              >
                {t("processingFolders.downloads.cancelSweep", "Cancel")}
              </Button>
              <Button size="sm" disabled loading>
                {t("processingFolders.downloads.working", "Processing…")}
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
          <p className="downloads-wizard__path">{suggestion.directory}</p>
          <ul className="downloads-wizard__facts">
            <li>
              {t(
                "processingFolders.downloads.keepsOriginals",
                "Files are processed in place — and each original is kept, so you can restore it any time.",
              )}
            </li>
            {capped && (
              <li>
                {t("processingFolders.downloads.capped", {
                  limit: suggestion.limit,
                  found: suggestion.pdfCount,
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
              total: sweepTotal,
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
                width: `${sweepTotal === 0 ? 0 : Math.round((settled / sweepTotal) * 100)}%`,
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
            {processed + failed === 0
              ? (summary?.failed ?? 0) > 0
                ? t("processingFolders.downloads.stillParked", {
                    count: summary?.failed ?? 0,
                    defaultValue:
                      "{{count}} files failed earlier and were not retried — fix the cause, then run again.",
                  })
                : t("processingFolders.downloads.nothingNew", {
                    count: summary?.done ?? 0,
                    defaultValue:
                      "Nothing new to process — these {{count}} files have already been through.",
                  })
              : t("processingFolders.downloads.finished", {
                  count: processed,
                  opened,
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
          {failed > 0 && (
            <p className="downloads-wizard__warn">
              {t("processingFolders.downloads.someFailed", {
                count: failed,
                defaultValue:
                  "{{count}} could not be processed and were left untouched.",
              })}
            </p>
          )}
          {stalled && (
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
