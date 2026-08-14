import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader } from "@mantine/core";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";
import {
  CLASSIFY_OPERATION,
  fetchDownloadsSuggestion,
  fetchProcessingFolderRuns,
  fetchRunOutputFile,
  saveProcessingFolder,
  type DownloadsSuggestion,
  type ProcessingRunOutput,
} from "@app/services/processingFolderApi";
import { refreshProcessingFolders } from "@app/hooks/useProcessingFolders";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useFolders } from "@app/contexts/FolderContext";
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
  const [started, setStarted] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [opened, setOpened] = useState(0);
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
    setStarted(0);
    setSkipped(0);
    setStalled(false);
    setOpened(0);
  };

  /**
   * Poll the folder's runs until the sweep's own runs have all settled. `expected` is what the
   * server reported starting, so this never waits on runs that were never going to appear — and
   * gives up after a bounded wait rather than spinning forever if a run goes missing.
   */
  /**
   * Pull a batch of results into the workbench as open files. Runs happen server-side, so without
   * this the user is left with a finished job and an unchanged screen. Downloads are sequential so
   * a hundred results don't open a hundred parallel requests, and one failure costs one file
   * rather than the batch — it is still in the user's file library either way.
   */
  const openInWorkbench = useCallback(
    async (outputs: ProcessingRunOutput[]) => {
      if (outputs.length === 0) return;
      const files: File[] = [];
      for (const output of outputs) {
        try {
          files.push(await fetchRunOutputFile(output));
        } catch (e) {
          // Skipped: it is still in the file library, just not opened. Logged rather than
          // swallowed — a download that fails for every file is indistinguishable from the
          // pipeline producing nothing, and looks like the feature simply not working.
          console.warn(
            `[processing folders] could not open result ${output.fileId}`,
            e,
          );
        }
      }
      if (files.length === 0) return;
      await addFiles(files, { selectFiles: true });
      setOpened((count) => count + files.length);
    },
    [addFiles],
  );

  /**
   * Poll until the sweep's own runs have settled, opening each run's results as soon as that run
   * finishes rather than at the end. A single slow or stuck file would otherwise hold back
   * everything that already succeeded, and a timeout would throw all of it away.
   */
  const trackRuns = useCallback(
    async (policyId: string, expected: number) => {
      const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED"];
      const alreadyOpened = new Set<string>();
      for (let attempt = 0; attempt < 900; attempt++) {
        const runs = await fetchProcessingFolderRuns(policyId).catch(() => []);
        const settled = runs.filter((run) => TERMINAL.includes(run.status));
        const done = settled.filter((run) => run.status === "COMPLETED");
        setProcessed(done.length);
        setFailed(settled.length - done.length);

        const fresh = done.filter(
          (run) => run.runId && !alreadyOpened.has(run.runId),
        );
        fresh.forEach((run) => alreadyOpened.add(run.runId!));
        await openInWorkbench(fresh.flatMap((run) => run.outputs ?? []));

        if (settled.length >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setStalled(true);
    },
    [openInWorkbench],
  );

  const approve = async () => {
    if (!suggestion) return;
    setPhase("working");
    try {
      const folder = await saveProcessingFolder({
        directory: suggestion.directory,
        enabled: true,
        steps: [{ operation: CLASSIFY_OPERATION, parameters: {}, assets: {} }],
      });
      // Mount the directory as a local folder too, so Downloads exists in the
      // file manager as a real folder — the processing record attaches to it
      // there — rather than results appearing from nowhere. Idempotent, and
      // best-effort: the sweep's results matter more than the bookmark.
      const segments = suggestion.directory.split(/[/\\]/).filter(Boolean);
      await mountLocalFolder(
        suggestion.directory,
        segments[segments.length - 1] ?? suggestion.directory,
      ).catch(() => {});
      // The server reports what it actually started; 0 means everything there was already
      // processed, which is a finished state, not something to wait for.
      setStarted(folder.startedRuns);
      setSkipped(folder.alreadyProcessed);
      // The new folder was created outside the hook's own actions; refresh the shared list so the
      // files page and any other consumer pick it up without a reload.
      void refreshProcessingFolders();
      if (folder.startedRuns > 0) {
        await trackRuns(folder.id, folder.startedRuns);
      }
      // One sweep, not a standing watch: the offer's promise is "sort out what is already in
      // Downloads", so the folder is stood down once it has. Leaving it enabled would keep
      // opening files into the workbench every time anything landed in Downloads.
      await saveProcessingFolder({
        id: folder.id,
        directory: suggestion.directory,
        enabled: false,
        steps: [{ operation: CLASSIFY_OPERATION, parameters: {}, assets: {} }],
      }).catch(() => {
        // The results are already in; a folder left running is a nuisance, not a failure.
      });
      void refreshProcessingFolders();
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  };

  if (!suggestion) return null;

  const capped = suggestion.pdfCount > suggestion.limit;
  const total = Math.min(suggestion.pdfCount, suggestion.limit);

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

  return (
    <Modal
      open
      onClose={phase === "working" ? () => {} : close}
      width="sm"
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
            <Button size="sm" disabled loading>
              {t("processingFolders.downloads.working", "Processing…")}
            </Button>
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
                "Your files stay where they are — originals are never moved or deleted.",
              )}
            </li>
            <li>
              {t("processingFolders.downloads.outputs", {
                subdir: "Stirling Processed",
                defaultValue:
                  'Results are saved into a "{{subdir}}" folder alongside them.',
              })}
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
        <div className="downloads-wizard__body downloads-wizard__progress">
          <Loader size="sm" />
          <p>
            {t("processingFolders.downloads.progress", {
              done: processed + failed,
              total: started || total,
              defaultValue: "Processing {{done}} of {{total}} files…",
            })}
          </p>
          <div className="downloads-wizard__bar" role="progressbar">
            <span
              style={{
                width: `${
                  (started || total) === 0
                    ? 0
                    : Math.round(
                        ((processed + failed) / (started || total)) * 100,
                      )
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="downloads-wizard__body downloads-wizard__progress">
          <CheckCircleIcon className="downloads-wizard__tick" />
          {started === 0 ? (
            <p>
              {t("processingFolders.downloads.nothingNew", {
                count: skipped,
                defaultValue:
                  "Nothing new to process — these {{count}} files have already been through.",
              })}
            </p>
          ) : (
            <p>
              {t("processingFolders.downloads.finished", {
                count: processed,
                opened,
                defaultValue:
                  "Classified {{count}} files and opened {{opened}} of them here, ready to work on.",
              })}
            </p>
          )}
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
