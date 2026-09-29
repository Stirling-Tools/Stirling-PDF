import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { Button } from "@app/ui/Button";
import {
  useAllFiles,
  useFileManagement,
  useFileSelectors,
} from "@app/contexts/FileContext";
import { useHotkeys } from "@app/contexts/HotkeyContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  isRunInFlight,
  usePolicyRuns,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";
import {
  getWorkspacePolicyBlocks,
  registerPolicyWorkspace,
  subscribePolicyFileUsage,
  policyFileUsageVersion,
  type PolicyRecoveryBlock,
} from "@app/services/policyBlockRegistry";
import { loadPolicies, onPoliciesChange } from "@app/services/policyStorage";
import { loadPolicyCatalog } from "@app/services/policyCatalog";
import { runPolicyOnFile } from "@app/services/policyDispatch";
import { dispatchableFileId } from "@app/components/policies/policyLocalPass";
import { fileStorage } from "@app/services/fileStorage";
import type { PoliciesByKey } from "@app/types/policies";
import type { FileId } from "@app/types/file";
import "@app/components/policies/PolicyRecoveryGate.css";

/** Keeps the editor mounted but inaccessible until all open, failed inputs are recovered or closed. */
export function PolicyRecoveryGate() {
  const { fileStubs } = useAllFiles();
  const selectors = useFileSelectors();
  const runs = usePolicyRuns();
  useSyncExternalStore(subscribePolicyFileUsage, policyFileUsageVersion);
  const [policies, setPolicies] = useState(loadPolicies);
  useEffect(() => onPoliciesChange(() => setPolicies(loadPolicies())), []);
  useLayoutEffect(
    () => registerPolicyWorkspace(selectors.getStirlingFileStubs),
    [selectors],
  );
  const blocks = getWorkspacePolicyBlocks(fileStubs);
  return blocks.length ? (
    <RecoveryDialog blocks={blocks} policies={policies} runs={runs} />
  ) : null;
}

interface RecoveryDialogProps {
  blocks: PolicyRecoveryBlock[];
  policies: PoliciesByKey;
  runs: PolicyRunRecord[];
}

function affectedFileIds(blocks: PolicyRecoveryBlock[]): FileId[] {
  return [
    ...new Set(
      blocks.flatMap((block) => block.affectedFiles.map((file) => file.id)),
    ),
  ];
}

function recoveryKey(block: PolicyRecoveryBlock): string {
  return `${block.outcome.policyKey}:${block.outcome.fileId}`;
}

function RecoveryDialog({ blocks, policies, runs }: RecoveryDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { pauseHotkeys, resumeHotkeys, areHotkeysPaused } = useHotkeys();
  const previouslyPaused = useRef(areHotkeysPaused);
  const { removeFiles } = useFileManagement();
  const { actions: navigation } = useNavigationActions();
  const { setPreviewFile } = useToolWorkflow();
  const [dispatching, setDispatching] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState(false);
  const labels = new Map(
    loadPolicyCatalog().categories.map((category) => [
      category.id,
      category.label,
    ]),
  );
  const fileIds = affectedFileIds(blocks);
  const policyKeys = [
    ...new Set(blocks.map((block) => block.outcome.policyKey)),
  ];
  const runningBlocks = blocks.filter(
    (block) =>
      dispatching.has(recoveryKey(block)) ||
      runs.some(
        (run) =>
          run.fileId === block.outcome.fileId &&
          run.policyKey === block.outcome.policyKey &&
          run.startedAt >= block.outcome.startedAt &&
          isRunInFlight(run),
      ),
  );
  const runningFileCount = affectedFileIds(runningBlocks).length;
  const retryable = blocks.flatMap((block) => {
    const backendId = policies[block.outcome.policyKey]?.backendId;
    return backendId ? [{ block, backendId }] : [];
  });
  const retryFileCount = affectedFileIds(
    retryable.map(({ block }) => block),
  ).length;
  const policyName = (key: string) =>
    policies[key]?.name ?? labels.get(key) ?? key;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    // The top layer also makes existing portals inert; a z-index overlay cannot do that.
    dialog.showModal();
    pauseHotkeys();
    const stopEvent = (event: Event) => event.stopPropagation();
    // Keep dialog events out of editor handlers without cancelling browser or clipboard defaults.
    for (const name of ["keydown", "keyup", "copy", "cut", "paste"])
      dialog.addEventListener(name, stopEvent);
    return () => {
      for (const name of ["keydown", "keyup", "copy", "cut", "paste"])
        dialog.removeEventListener(name, stopEvent);
      dialog.close();
      if (!previouslyPaused.current) resumeHotkeys();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [pauseHotkeys, resumeHotkeys]);

  const retry = async () => {
    if (runningFileCount || closing) return;
    setDispatching(new Set(retryable.map(({ block }) => recoveryKey(block))));
    setError(false);
    const results = await Promise.allSettled(
      retryable.map(async ({ block, backendId }) => {
        const { fileId, policyKey, fileName } = block.outcome;
        try {
          // The failed source can be closed while its descendants remain open.
          const source = await fileStorage.getStirlingFileStub(
            fileId as FileId,
          );
          const target = source ? dispatchableFileId(source) : null;
          if (!target) throw new Error("Policy source cannot be retried");
          await runPolicyOnFile(
            policyKey,
            backendId,
            target,
            fileName ?? block.affectedFiles[0].name,
          );
        } finally {
          setDispatching((previous) => {
            const next = new Set(previous);
            next.delete(recoveryKey(block));
            return next;
          });
        }
      }),
    );
    setError(results.some((result) => result.status === "rejected"));
  };

  const closeFiles = async () => {
    if (closing) return;
    setClosing(true);
    setError(false);
    try {
      // End the tool session so retained comparison slots and previews cannot keep using the input.
      navigation.setSelectedTool(null);
      navigation.setWorkbench("fileEditor");
      setPreviewFile(null);
      await removeFiles(fileIds, false);
    } catch {
      setError(true);
    } finally {
      setClosing(false);
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="policy-recovery"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id={titleId}>{t("policy.recoveryTitle")}</h2>
      <p id={bodyId}>
        {t("policy.recoverySummary", { count: fileIds.length })}
      </p>
      {error && <p role="alert">{t("policy.recoveryError")}</p>}
      <div className="policy-recovery__policies">
        {policyKeys.map((policyKey) => {
          const policy = policies[policyKey];
          const owner = policy?.owner?.trim();
          const isOwner = Boolean(
            owner &&
            !user?.is_anonymous &&
            (owner === user?.username ||
              owner.toLowerCase() === user?.email?.toLowerCase()),
          );
          return (
            <section className="policy-recovery__policy" key={policyKey}>
              <strong>{policyName(policyKey)}</strong>
              <p className="policy-recovery__hint">
                {t(
                  isOwner
                    ? "policy.recoveryOwnedPolicy"
                    : owner
                      ? "policy.recoveryContactOwner"
                      : "policy.recoveryContactAdmin",
                  { owner },
                )}
              </p>
            </section>
          );
        })}
      </div>
      <details className="policy-recovery__details">
        <summary>{t("policy.recoveryTechnicalDetails")}</summary>
        <div className="policy-recovery__errors">
          {blocks.map((block) => (
            <div className="policy-recovery__error" key={recoveryKey(block)}>
              <strong>
                {block.outcome.fileName ?? block.affectedFiles[0].name}
              </strong>
              {policyKeys.length > 1 && (
                <p>{policyName(block.outcome.policyKey)}</p>
              )}
              {block.outcome.error && <pre>{block.outcome.error}</pre>}
            </div>
          ))}
        </div>
      </details>
      <div className="policy-recovery__actions">
        <Button
          variant="primary"
          disabled={runningFileCount > 0 || closing || retryable.length === 0}
          onClick={() => void retry()}
        >
          {t(
            runningFileCount
              ? "policy.recoveryRetrying"
              : "policy.recoveryRetry",
            {
              count: runningFileCount || retryFileCount || fileIds.length,
            },
          )}
        </Button>
        <Button
          variant="secondary"
          disabled={closing}
          onClick={() => void closeFiles()}
        >
          {t(closing ? "policy.recoveryClosing" : "policy.recoveryClose", {
            count: fileIds.length,
          })}
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}
