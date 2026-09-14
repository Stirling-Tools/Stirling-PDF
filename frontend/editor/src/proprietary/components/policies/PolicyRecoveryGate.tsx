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
  const [error, setError] = useState(false);
  const labels = new Map(
    loadPolicyCatalog().categories.map((category) => [
      category.id,
      category.label,
    ]),
  );

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    // The top layer also makes existing portals inert; a z-index overlay cannot do that.
    dialog.showModal();
    pauseHotkeys();
    const blockShortcut = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        ["Tab", "Enter", " "].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const stopEvent = (event: Event) => event.stopPropagation();
    window.addEventListener("keydown", blockShortcut, true);
    window.addEventListener("keyup", blockShortcut, true);
    // Let Tab and button activation reach the dialog, then stop the editor's global listeners.
    for (const name of ["keydown", "keyup", "copy", "cut", "paste"])
      dialog.addEventListener(name, stopEvent);
    return () => {
      window.removeEventListener("keydown", blockShortcut, true);
      window.removeEventListener("keyup", blockShortcut, true);
      for (const name of ["keydown", "keyup", "copy", "cut", "paste"])
        dialog.removeEventListener(name, stopEvent);
      dialog.close();
      if (!previouslyPaused.current) resumeHotkeys();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [pauseHotkeys, resumeHotkeys]);

  const retry = async (block: PolicyRecoveryBlock) => {
    const { fileId, policyKey, fileName } = block.outcome;
    const backendId = policies[policyKey]?.backendId;
    if (!backendId) return;
    const key = `${policyKey}:${fileId}`;
    setDispatching((previous) => new Set(previous).add(key));
    setError(false);
    try {
      await runPolicyOnFile(
        policyKey,
        backendId,
        fileId as FileId,
        fileName ?? block.affectedFiles[0].name,
      );
    } catch {
      setError(true);
    } finally {
      setDispatching((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  };

  const closeFiles = async (block: PolicyRecoveryBlock) => {
    setError(false);
    try {
      // End the tool session so retained comparison slots and previews cannot keep using the input.
      navigation.setSelectedTool(null);
      navigation.setWorkbench("fileEditor");
      setPreviewFile(null);
      await removeFiles(
        block.affectedFiles.map((file) => file.id),
        false,
      );
    } catch {
      setError(true);
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
      <p id={bodyId}>{t("policy.recoveryBody")}</p>
      <p className="policy-recovery__hint">{t("policy.recoveryCloseHint")}</p>
      {error && <p role="alert">{t("policy.recoveryError")}</p>}
      <div className="policy-recovery__files">
        {blocks.map((block) => {
          const { outcome } = block;
          const policy = policies[outcome.policyKey];
          const owner = policy?.owner?.trim();
          const isOwner = Boolean(
            owner &&
            !user?.is_anonymous &&
            (owner === user?.username ||
              owner.toLowerCase() === user?.email?.toLowerCase()),
          );
          const key = `${outcome.policyKey}:${outcome.fileId}`;
          const running =
            dispatching.has(key) ||
            runs.some(
              (run) =>
                run.fileId === outcome.fileId &&
                run.policyKey === outcome.policyKey &&
                run.startedAt >= outcome.startedAt &&
                isRunInFlight(run),
            );
          return (
            <section className="policy-recovery__file" key={key}>
              <strong>{outcome.fileName ?? block.affectedFiles[0].name}</strong>
              <p>
                {policy?.name ??
                  labels.get(outcome.policyKey) ??
                  outcome.policyKey}
              </p>
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
              {outcome.error && (
                <details className="policy-recovery__details">
                  <summary>{t("policy.recoveryTechnicalDetails")}</summary>
                  <pre>{outcome.error}</pre>
                </details>
              )}
              <div className="policy-recovery__actions">
                <Button
                  variant="primary"
                  disabled={running || !policy?.backendId}
                  onClick={() => void retry(block)}
                >
                  {t(
                    running
                      ? "policy.recoveryRetrying"
                      : "policy.recoveryRetry",
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void closeFiles(block)}
                >
                  {t("policy.recoveryClose")}
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </dialog>,
    document.body,
  );
}
