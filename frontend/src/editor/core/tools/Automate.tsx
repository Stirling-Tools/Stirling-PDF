import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Stack, Text, Group } from "@mantine/core";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import AutomationSelection from "@editor/components/tools/automate/AutomationSelection";
import AutomationCreation from "@editor/components/tools/automate/AutomationCreation";
import AutomationRun from "@editor/components/tools/automate/AutomationRun";
import type { AutomationAction } from "@editor/components/tools/automate/AutomationActionsMenu";
import classes from "@editor/components/tools/automate/Automate.module.css";
import { Button } from "@editor/ui/Button";
import { Z_INDEX_AUTOMATE_MODAL } from "@editor/styles/zIndex";
import { useAutomateOperation } from "@editor/hooks/tools/automate/useAutomateOperation";
import { BaseToolProps } from "@editor/types/tool";
import { useToolRegistry } from "@editor/contexts/ToolRegistryContext";
import { useSavedAutomations } from "@editor/hooks/tools/automate/useSavedAutomations";
import { useOpenAsPipeline } from "@editor/hooks/tools/automate/useOpenAsPipeline";
import { useToolPanelSize } from "@editor/hooks/useToolPanelSize";
import {
  AutomationConfig,
  AutomationStepData,
  AutomationMode,
} from "@editor/types/automation";
import { AUTOMATION_STEPS } from "@editor/constants/automation";
import {
  downloadAutomationConfig,
  downloadFolderScanningConfig,
} from "@editor/utils/automationConverter";

const LIBRARY: AutomationStepData = { step: AUTOMATION_STEPS.SELECTION };

/**
 * One surface with three modes rather than accordion steps: the library
 * (SELECTION), one automation's workspace where it is previewed, run and its
 * results reviewed (RUN), and the builder as a focused mode (CREATION).
 */
const Automate = ({ onPreviewFile, onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions: navigationActions } = useNavigationActions();
  const { registerToolReset } = useToolWorkflow();

  const [view, setView] = useState<AutomationStepData>(LIBRARY);
  // Only the builder's inline step settings need the extra width.
  useToolPanelSize(view.step === AUTOMATION_STEPS.CREATION ? "xl" : "sm");
  const viewRef = useRef(view);
  viewRef.current = view;
  // Remounts the builder per session so its form seeds from the automation.
  const [builderSession, setBuilderSession] = useState(0);
  // Where Cancel in the builder returns to: the workspace it was opened from, or the library.
  const [builderReturn, setBuilderReturn] =
    useState<AutomationStepData>(LIBRARY);
  // Kept until the dialog's close transition ends, so its message keeps the name.
  const [pendingDelete, setPendingDelete] = useState<AutomationConfig | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);

  const automateOperation = useAutomateOperation();
  // Set by the workspace, which also counts the wait before a run begins.
  const runInFlightRef = useRef(false);
  // A finished run's results and Undo would be dropped by opening the copy.
  const hasResultsRef = useRef(false);
  hasResultsRef.current =
    automateOperation.files.length > 0 ||
    automateOperation.downloadUrl !== null;
  const setRunInFlight = useCallback((running: boolean) => {
    runInFlightRef.current = running;
  }, []);
  const { regularTools: toolRegistry } = useToolRegistry();
  const {
    savedAutomations,
    deleteAutomation,
    refreshAutomations,
    copyFromSuggested,
    importAutomation,
  } = useSavedAutomations();
  const pipelineOpener = useOpenAsPipeline();

  const go = (next: AutomationStepData) => {
    // A run's results and Undo survive a trip from its workspace to the builder
    // and back; any other move drops them.
    const sameAutomation = next.automation?.id === view.automation?.id;
    const keepsResults =
      sameAutomation &&
      (next.step === AUTOMATION_STEPS.RUN ||
        (next.step === AUTOMATION_STEPS.CREATION &&
          view.step === AUTOMATION_STEPS.RUN));
    if (!keepsResults) {
      automateOperation.resetResults();
      automateOperation.clearError();
    }
    setView(next);
  };

  // Library, workspace and builder replace one another in place, so the control
  // that had focus is gone after a move; focus the new view's heading instead
  // of letting it fall to <body>. Not on arrival, when the user has not moved.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const viewKey = `${view.step}:${view.automation?.id ?? ""}:${builderSession}`;
  const lastViewKeyRef = useRef(viewKey);
  // A library delete removes the row whose menu opened the dialog, so focus goes
  // to the heading once both the delete and the dialog's close have finished,
  // in whichever order they land.
  const deleteFocus = useRef({ deleted: false, closed: false });
  const focusHeadingOnceDeleteSettles = () => {
    if (deleteFocus.current.deleted && deleteFocus.current.closed) {
      deleteFocus.current = { deleted: false, closed: false };
      focusHeading();
    }
  };
  const focusHeading = () =>
    surfaceRef.current
      ?.querySelector<HTMLElement>("[data-automate-heading]")
      ?.focus({ preventScroll: true });
  useEffect(() => {
    // Compared with the last view rather than skipping the first run, which
    // StrictMode's second effect pass would otherwise take as a move.
    if (lastViewKeyRef.current === viewKey) return;
    lastViewKeyRef.current = viewKey;
    // "Edit step" lands focus on that step in the builder instead.
    if (view.focusStepIndex !== undefined) return;
    focusHeading();
  }, [viewKey, view.focusStepIndex]);

  const resetRef = useRef<() => void>(() => {});
  resetRef.current = () => {
    automateOperation.resetResults();
    automateOperation.clearError();
    setView(LIBRARY);
  };
  useEffect(() => {
    registerToolReset("automate", () => resetRef.current());
  }, [registerToolReset]);

  const openBuilder = (
    mode: AutomationMode,
    automation?: AutomationConfig,
    focusStepIndex?: number,
  ) => {
    setBuilderReturn(view.step === AUTOMATION_STEPS.RUN ? view : LIBRARY);
    setBuilderSession((n) => n + 1);
    go({ step: AUTOMATION_STEPS.CREATION, mode, automation, focusStepIndex });
  };

  const runOnFolderAction = (
    automation: AutomationConfig,
  ): AutomationAction[] => {
    const open = pipelineOpener(automation);
    if (!open) return [];
    return [
      {
        key: "runOnFolder",
        label: t("automate.run.runOnFolderTitle", "Run this on every new file"),
        icon: "folder-input",
        onClick: open,
      },
    ];
  };

  const savedActions = (automation: AutomationConfig): AutomationAction[] => [
    {
      key: "edit",
      label: t("edit", "Edit"),
      icon: "pencil",
      onClick: () => openBuilder(AutomationMode.EDIT, automation),
    },
    ...runOnFolderAction(automation),
    {
      key: "export",
      label: t("automate.export", "Export"),
      icon: "download",
      onClick: () => downloadAutomationConfig(automation),
    },
    {
      key: "exportFolderScan",
      label: t(
        "automate.exportForFolderScanning",
        "Export for Folder Scanning",
      ),
      icon: "download",
      onClick: () => downloadFolderScanningConfig(automation, toolRegistry),
    },
    {
      key: "delete",
      label: t("delete", "Delete"),
      icon: "trash",
      danger: true,
      separated: true,
      onClick: () => {
        deleteFocus.current = { deleted: false, closed: false };
        setPendingDelete(automation);
        setDeleteOpen(true);
      },
    },
  ];

  const suggestedActions = (
    automation: AutomationConfig,
  ): AutomationAction[] => [
    {
      key: "customise",
      label: t("automate.customize", "Customize"),
      icon: "sliders-horizontal",
      onClick: () => openBuilder(AutomationMode.SUGGESTED, automation),
    },
    ...runOnFolderAction(automation),
    {
      key: "copy",
      label: t("automate.duplicate", "Duplicate"),
      icon: "copy",
      onClick: async () => {
        try {
          const copy = await copyFromSuggested({
            ...automation,
            name: t("automate.copyName", "{{name}} (copy)", {
              name: automation.name,
            }),
          });
          // From the suggestion's own workspace, open the copy so the user sees
          // what was made; in the library the new Saved row shows it. Read the
          // view after the save: the user may have left, or started a run whose
          // results must stay on this workspace.
          const current = viewRef.current;
          if (
            !runInFlightRef.current &&
            !hasResultsRef.current &&
            current.step === AUTOMATION_STEPS.RUN &&
            current.automation?.id === automation.id
          ) {
            go({
              step: AUTOMATION_STEPS.RUN,
              automation: copy,
              source: "saved",
            });
          }
        } catch (error) {
          console.error("Failed to copy suggested automation:", error);
          onError?.(`Failed to copy automation: ${automation.name}`);
        }
      },
    },
  ];

  const confirmDelete = async () => {
    const automation = pendingDelete;
    if (!deleteOpen || !automation) return;
    setDeleteOpen(false);
    try {
      await deleteAutomation(automation.id);
      if (view.automation?.id === automation.id) go(LIBRARY);
      else {
        deleteFocus.current.deleted = true;
        focusHeadingOnceDeleteSettles();
      }
    } catch (error) {
      console.error("Failed to delete automation:", error);
      onError?.(`Failed to delete automation: ${automation.name}`);
    }
  };

  const renderView = () => {
    switch (view.step) {
      case AUTOMATION_STEPS.CREATION:
        if (!view.mode) return null;
        return (
          <AutomationCreation
            key={builderSession}
            mode={view.mode}
            existingAutomation={view.automation}
            focusStepIndex={view.focusStepIndex}
            onBack={() => go(builderReturn)}
            backLabel={
              builderReturn.step === AUTOMATION_STEPS.RUN &&
              builderReturn.automation
                ? t("automate.backTo", "Back to {{name}}", {
                    name: builderReturn.automation.name,
                  })
                : undefined
            }
            onComplete={(saved) => {
              refreshAutomations();
              // The saved steps may differ from the ones that produced the results.
              automateOperation.resetResults();
              automateOperation.clearError();
              go({
                step: AUTOMATION_STEPS.RUN,
                automation: saved,
                source: "saved",
              });
            }}
            toolRegistry={toolRegistry}
          />
        );

      case AUTOMATION_STEPS.RUN: {
        const automation = view.automation;
        if (!automation) return null;
        const isSaved = view.source === "saved";
        return (
          <AutomationRun
            key={automation.id}
            automation={automation}
            automateOperation={automateOperation}
            actions={
              isSaved ? savedActions(automation) : suggestedActions(automation)
            }
            editAction={
              isSaved
                ? {
                    label: t("edit", "Edit"),
                    icon: "pencil",
                    onClick: () => openBuilder(AutomationMode.EDIT, automation),
                  }
                : {
                    label: t("automate.customize", "Customize"),
                    icon: "sliders-horizontal",
                    onClick: () =>
                      openBuilder(AutomationMode.SUGGESTED, automation),
                  }
            }
            onRunOnFolder={pipelineOpener(automation) ?? undefined}
            onRunningChange={setRunInFlight}
            onBack={() => go(LIBRARY)}
            onDone={() => {
              go(LIBRARY);
              onComplete?.([]);
            }}
            onEditStep={(index) =>
              openBuilder(
                isSaved ? AutomationMode.EDIT : AutomationMode.SUGGESTED,
                automation,
                index,
              )
            }
            onFileClick={(file) => {
              onPreviewFile?.(file);
              navigationActions.setWorkbench("viewer");
            }}
            onUndo={async () => {
              await automateOperation.undoOperation();
              onPreviewFile?.(null);
            }}
          />
        );
      }

      default:
        return (
          <AutomationSelection
            savedAutomations={savedAutomations}
            onCreateNew={() => openBuilder(AutomationMode.CREATE)}
            onOpenSaved={(automation) =>
              go({ step: AUTOMATION_STEPS.RUN, automation, source: "saved" })
            }
            onOpenSuggested={(automation) =>
              go({
                step: AUTOMATION_STEPS.RUN,
                automation,
                source: "suggested",
              })
            }
            savedActions={savedActions}
            suggestedActions={suggestedActions}
            onCreateFromActivity={(automation) =>
              openBuilder(AutomationMode.SUGGESTED, automation)
            }
            onImportAutomation={importAutomation}
            onImportError={(message) => onError?.(message)}
            toolRegistry={toolRegistry}
          />
        );
    }
  };

  return (
    <div className={classes.surface} ref={surfaceRef}>
      {renderView()}
      <Modal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onExitTransitionEnd={() => {
          setPendingDelete(null);
          deleteFocus.current.closed = true;
          focusHeadingOnceDeleteSettles();
        }}
        title={t("automate.delete.title", "Delete automation?")}
        centered
        zIndex={Z_INDEX_AUTOMATE_MODAL}
      >
        <Stack gap="md">
          <Text size="sm">
            {t(
              "automate.delete.message",
              "“{{name}}” will be removed from your saved automations. This can't be undone.",
              {
                name: pendingDelete?.name ?? "",
              },
            )}
          </Text>
          <Group gap="sm" justify="flex-end">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              {t("automate.delete.cancel", "Cancel")}
            </Button>
            <Button accent="danger" onClick={confirmDelete}>
              {t("automate.delete.confirm", "Delete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};

export default Automate;
