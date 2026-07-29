import React, { useCallback, useContext } from "react";
import { Group, Loader, Progress, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import {
  useFileState,
  useFileSelection,
  useFileActions,
} from "@app/contexts/FileContext";
import { isStirlingFile } from "@app/types/fileContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { ViewerContext, useViewer } from "@app/contexts/ViewerContext";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import {
  POLICY_IN_FLIGHT_STATUSES,
  usePolicyRuns,
} from "@app/components/policies/policyRunStore";
import { downloadFileWithPolicy } from "@app/services/exportWithPolicy";
import { enforceExportPolicies } from "@app/services/policyExport";
import { downloadFile as downloadRaw } from "@app/services/downloadService";
import { withReviewClearance, type ExportVerb } from "@app/services/reviewGate";
import { alert as showAlert } from "@app/components/toast";

export type { ExportVerb };

export interface ExportActions {
  /** Files an export-type action would touch in the current view. */
  targetIds: string[];
  /** True while a policy is actively enforcing on any target file — export
   *  buttons should be disabled with {@link enforcingTooltip} shown. */
  enforcing: boolean;
  /** Tooltip body for a control disabled by in-flight enforcement. */
  enforcingTooltip: (actionLabel: string) => React.ReactNode;
  /** Download the current target(s). Review-gated. */
  download: () => void;
  /** Download as a new file (never overwrite the local path). Review-gated. */
  saveAs: () => void;
  /** Print the viewer's file. Review-gated. */
  print: () => void;
  /**
   * Run a bespoke export-type flow (e.g. share) behind the same review gate.
   * Use this for any new action that lets a document leave the app.
   */
  runGuarded: (verb: ExportVerb, proceed: () => void | Promise<void>) => void;
}

/**
 * Single entry point for actions that let a document leave the app. Every
 * action it exposes is review-gated, so a caller cannot forget the guard.
 */
export function useExportActions(): ExportActions {
  const { t } = useTranslation();
  const { workbench: currentView } = useNavigationState();
  const viewerContext = useContext(ViewerContext);
  const { activeFileId } = useViewer();
  const { selectors } = useFileState();
  const { selectedFiles, selectedFileIds } = useFileSelection();
  const { actions: fileActions } = useFileActions();
  const { pageEditorFunctions } = useToolWorkflow();
  const policyFileBadges = usePolicyFileBadges();
  const policyRuns = usePolicyRuns();

  const activeFiles = selectors.getFiles();

  // The viewer exports its active file; every other view exports the selection,
  // or all files when nothing is selected.
  const targetIds: string[] =
    currentView === "viewer"
      ? activeFileId
        ? [activeFileId]
        : []
      : selectedFileIds.length > 0
        ? selectedFileIds
        : activeFiles.filter(isStirlingFile).map((f) => f.fileId);

  const enforcingFileId = targetIds.find((id) =>
    (policyFileBadges.get(id) ?? []).some((p) => p.enforcing),
  );
  const enforcing = enforcingFileId != null;
  const enforcingRun = enforcing
    ? policyRuns.find(
        (r) =>
          r.fileId === enforcingFileId &&
          (POLICY_IN_FLIGHT_STATUSES as readonly string[]).includes(r.status),
      )
    : undefined;
  const enforcingProgress =
    enforcingRun?.currentStep != null && enforcingRun.stepCount
      ? Math.round((enforcingRun.currentStep / enforcingRun.stepCount) * 100)
      : undefined;

  const enforcingTooltip = useCallback(
    (actionLabel: string): React.ReactNode => (
      <Stack gap={6} py={2} w={200}>
        <Group gap={6} wrap="nowrap">
          <ShieldOutlinedIcon style={{ fontSize: 13 }} />
          <Text size="xs" fw={600}>
            {t(
              "policy.blockingAction",
              "{{action}} blocked while enforcing policy, please wait",
              { action: actionLabel },
            )}
          </Text>
        </Group>
        {enforcingProgress != null ? (
          <Progress
            w="100%"
            size="xs"
            radius="xl"
            value={enforcingProgress}
            striped
            animated
          />
        ) : (
          <Loader size="xs" />
        )}
      </Stack>
    ),
    [t, enforcingProgress],
  );

  // Batch exports clear the gate once for all their targets, so the reviewer
  // gets a single prompt instead of one per file: the clearance holds for as
  // long as `proceed` runs, so the chokepoints inside it stay quiet.
  const runGuarded = useCallback(
    (verb: ExportVerb, proceed: () => void | Promise<void>) => {
      void withReviewClearance(targetIds, verb, proceed);
    },
    // targetIds is derived per render; the callback identity follows its content.
    [targetIds.join("|")],
  );

  const performExport = useCallback(
    async (forceNewFile: boolean) => {
      if (currentView === "viewer") {
        const buffer = await viewerContext?.exportActions?.saveAsCopy?.();
        if (!buffer) return;
        const fileToExport =
          selectedFiles.length > 0 ? selectedFiles[0] : activeFiles[0];
        if (!fileToExport) return;
        const stub = isStirlingFile(fileToExport)
          ? selectors.getStirlingFileStub(fileToExport.fileId)
          : undefined;
        try {
          const result = await downloadFileWithPolicy({
            data: new Blob([buffer], { type: "application/pdf" }),
            filename: fileToExport.name,
            localPath: forceNewFile ? undefined : stub?.localFilePath,
            fileId: stub?.id,
          });
          if (!forceNewFile && !result.cancelled && stub && result.savedPath) {
            fileActions.updateStirlingFileStub(stub.id, {
              localFilePath: stub.localFilePath ?? result.savedPath,
              isDirty: false,
            });
          }
        } catch (error) {
          console.error(
            "[useExportActions] Failed to export viewer file:",
            error,
          );
        }
        return;
      }

      if (currentView === "pageEditor") {
        pageEditorFunctions?.onExportAll?.();
        return;
      }

      const filesToExport =
        selectedFiles.length > 0 ? selectedFiles : activeFiles;
      const stubs = filesToExport.map((file) =>
        isStirlingFile(file)
          ? selectors.getStirlingFileStub(file.fileId)
          : undefined,
      );

      // Enforce all files in one batch so the toast shows progress across the
      // whole set (e.g. "report.pdf (2 of 5)") rather than N invisible solo runs.
      let enforced: File[];
      try {
        enforced = await enforceExportPolicies(
          filesToExport as File[],
          stubs.map((s) => s?.id),
        );
      } catch {
        enforced = filesToExport as File[];
        showAlert({
          alertType: "warning",
          title: t("policies.enforcement.exportFailureTitle"),
          body: t("policies.enforcement.exportFailureBody"),
        });
      }

      for (let idx = 0; idx < filesToExport.length; idx++) {
        const file = filesToExport[idx];
        const stub = stubs[idx];
        try {
          const result = await downloadRaw({
            data: enforced[idx],
            filename: file.name,
            localPath: forceNewFile ? undefined : stub?.localFilePath,
            fileId: stub?.id,
          });
          if (result.cancelled) continue;
          if (!forceNewFile && stub && result.savedPath) {
            fileActions.updateStirlingFileStub(stub.id, {
              localFilePath: stub.localFilePath ?? result.savedPath,
              isDirty: false,
            });
          }
        } catch (error) {
          console.error(
            "[useExportActions] Failed to export file:",
            file.name,
            error,
          );
        }
      }
    },
    [
      currentView,
      selectedFiles,
      activeFiles,
      pageEditorFunctions,
      viewerContext,
      selectors,
      fileActions,
      t,
    ],
  );

  const download = useCallback(
    () => runGuarded("download", () => performExport(false)),
    [runGuarded, performExport],
  );
  const saveAs = useCallback(
    () => runGuarded("save", () => performExport(true)),
    [runGuarded, performExport],
  );
  // No runGuarded here: the viewer's print action gates itself, so both this
  // button and the viewer's "p" shortcut are covered without double-prompting.
  const print = useCallback(
    () => viewerContext?.printActions?.print?.(),
    [viewerContext],
  );

  return {
    targetIds,
    enforcing,
    enforcingTooltip,
    download,
    saveAs,
    print,
    runGuarded,
  };
}
