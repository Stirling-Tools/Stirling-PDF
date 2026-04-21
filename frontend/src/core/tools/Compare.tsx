import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CompareRoundedIcon from "@mui/icons-material/CompareRounded";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Group,
  Stack,
  Text,
  Button,
  Modal,
  ActionIcon,
} from "@mantine/core";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import {
  useCompareParameters,
  defaultParameters as compareDefaultParameters,
} from "@app/hooks/tools/compare/useCompareParameters";
import {
  useCompareOperation,
  CompareOperationHook,
} from "@app/hooks/tools/compare/useCompareOperation";
import CompareWorkbenchView from "@app/components/tools/compare/CompareWorkbenchView";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import type { FileId } from "@app/types/file";
import type { StirlingFile } from "@app/types/fileContext";
import DocumentThumbnail from "@app/components/shared/filePreview/DocumentThumbnail";
import type { CompareWorkbenchData } from "@app/types/compare";
import { getDefaultWorkbench } from "@app/types/workbench";
import { truncateCenter } from "@app/utils/textUtils";
import {
  FileSelectorPicker,
  FileSelectorResult,
} from "@app/components/shared/FileSelectorPicker";
import "@app/components/tools/compare/compareView.css";

const CUSTOM_VIEW_ID = "compareWorkbenchView";
const CUSTOM_WORKBENCH_ID = "custom:compareWorkbenchView" as const;

const Compare = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { actions: navigationActions } = useNavigationActions();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();

  const base = useBaseTool(
    "compare",
    useCompareParameters,
    useCompareOperation,
    props,
    {
      minFiles: 0,
      ignoreViewerScope: true,
    },
  );

  const operation = base.operation as CompareOperationHook;
  const params = base.params.parameters;

  const compareIcon = useMemo(
    () => <CompareRoundedIcon fontSize="small" />,
    [],
  );
  const [swapConfirmOpen, setSwapConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Slot state — files loaded directly for comparison, never added to workbench
  const [baseSlot, setBaseSlot] = useState<FileSelectorResult | null>(null);
  const [compSlot, setCompSlot] = useState<FileSelectorResult | null>(null);

  // Sync params fileIds from slots (needed for operation result matching)
  useEffect(() => {
    base.params.setParameters((prev) => ({
      ...prev,
      baseFileId: baseSlot?.stirlingFile.fileId ?? null,
      comparisonFileId: compSlot?.stirlingFile.fileId ?? null,
    }));
  }, [baseSlot?.stirlingFile.fileId, compSlot?.stirlingFile.fileId]);

  const performClearSelected = useCallback(() => {
    try {
      base.operation.cancelOperation();
    } catch {
      console.error("Failed to cancel operation");
    }
    try {
      base.operation.resetResults();
    } catch {
      console.error("Failed to reset results");
    }
    setBaseSlot(null);
    setCompSlot(null);
    clearCustomWorkbenchViewData(CUSTOM_VIEW_ID);
    navigationActions.setWorkbench(getDefaultWorkbench());
  }, [base.operation, clearCustomWorkbenchViewData, navigationActions]);

  useEffect(() => {
    const handler = () => {
      performClearSelected();
    };
    window.addEventListener(
      "compare:clear-selected",
      handler as unknown as EventListener,
    );
    return () => {
      window.removeEventListener(
        "compare:clear-selected",
        handler as unknown as EventListener,
      );
    };
  }, [performClearSelected]);

  useEffect(() => {
    registerCustomWorkbenchView({
      id: CUSTOM_VIEW_ID,
      workbenchId: CUSTOM_WORKBENCH_ID,
      label: "Compare view",
      icon: compareIcon,
      component: CompareWorkbenchView,
    });

    return () => {
      unregisterCustomWorkbenchView(CUSTOM_VIEW_ID);
    };
    // Register once only
  }, []);

  // Track workbench data and drive loading/result state transitions
  const lastProcessedAtRef = useRef<number | null>(null);
  const lastWorkbenchDataRef = useRef<CompareWorkbenchData | null>(null);

  const updateWorkbenchData = useCallback(
    (data: CompareWorkbenchData) => {
      const previous = lastWorkbenchDataRef.current;
      if (
        previous &&
        previous.result === data.result &&
        previous.baseFileId === data.baseFileId &&
        previous.comparisonFileId === data.comparisonFileId &&
        previous.isLoading === data.isLoading &&
        previous.baseLocalFile === data.baseLocalFile &&
        previous.comparisonLocalFile === data.comparisonLocalFile
      ) {
        return;
      }
      lastWorkbenchDataRef.current = data;
      setCustomWorkbenchViewData(CUSTOM_VIEW_ID, data);
    },
    [setCustomWorkbenchViewData],
  );

  const prepareWorkbenchForRun = useCallback(
    (
      baseId: FileId | null,
      compId: FileId | null,
      baseFile: StirlingFile | null,
      comparisonFile: StirlingFile | null,
    ) => {
      if (!baseId || !compId) return;

      updateWorkbenchData({
        result: null,
        baseFileId: baseId,
        comparisonFileId: compId,
        baseLocalFile: baseFile,
        comparisonLocalFile: comparisonFile,
        isLoading: true,
      });

      lastProcessedAtRef.current = null;
    },
    [updateWorkbenchData],
  );

  useEffect(() => {
    const baseFileId = params.baseFileId as FileId | null;
    const comparisonFileId = params.comparisonFileId as FileId | null;

    if (!baseFileId || !comparisonFileId) {
      lastProcessedAtRef.current = null;
      lastWorkbenchDataRef.current = null;
      clearCustomWorkbenchViewData(CUSTOM_VIEW_ID);
      return;
    }

    const result = operation.result;
    const processedAt = result?.totals.processedAt ?? null;

    if (
      result &&
      processedAt !== null &&
      processedAt !== lastProcessedAtRef.current &&
      result.base.fileId === baseFileId &&
      result.comparison.fileId === comparisonFileId
    ) {
      const previous = lastWorkbenchDataRef.current;
      updateWorkbenchData({
        result,
        baseFileId,
        comparisonFileId,
        baseLocalFile:
          baseSlot?.stirlingFile ?? previous?.baseLocalFile ?? null,
        comparisonLocalFile:
          compSlot?.stirlingFile ?? previous?.comparisonLocalFile ?? null,
        isLoading: false,
      });
      lastProcessedAtRef.current = processedAt;
      return;
    }

    if (base.operation.isLoading) {
      const previous = lastWorkbenchDataRef.current;
      updateWorkbenchData({
        result: null,
        baseFileId,
        comparisonFileId,
        baseLocalFile:
          baseSlot?.stirlingFile ?? previous?.baseLocalFile ?? null,
        comparisonLocalFile:
          compSlot?.stirlingFile ?? previous?.comparisonLocalFile ?? null,
        isLoading: true,
      });
      return;
    }
  }, [
    base.operation.isLoading,
    baseSlot,
    clearCustomWorkbenchViewData,
    compSlot,
    operation.result,
    params.baseFileId,
    params.comparisonFileId,
    updateWorkbenchData,
  ]);

  const handleExecuteCompare = useCallback(async () => {
    if (!baseSlot || !compSlot) return;
    const baseId = baseSlot.stirlingFile.fileId;
    const compId = compSlot.stirlingFile.fileId;
    const selected: StirlingFile[] = [
      baseSlot.stirlingFile,
      compSlot.stirlingFile,
    ];

    prepareWorkbenchForRun(
      baseId,
      compId,
      baseSlot.stirlingFile,
      compSlot.stirlingFile,
    );
    requestAnimationFrame(() => {
      navigationActions.setWorkbench(CUSTOM_WORKBENCH_ID);
    });

    await operation.executeOperation(
      { ...params, baseFileId: baseId, comparisonFileId: compId },
      selected,
    );
  }, [
    baseSlot,
    compSlot,
    navigationActions,
    operation,
    params,
    prepareWorkbenchForRun,
  ]);

  const performSwap = useCallback(() => {
    if (!baseSlot || !compSlot) return;
    const newBase = compSlot;
    const newComp = baseSlot;
    setBaseSlot(newBase);
    setCompSlot(newComp);
    if (operation.result) {
      const baseId = newBase.stirlingFile.fileId;
      const compId = newComp.stirlingFile.fileId;
      const selected: StirlingFile[] = [
        newBase.stirlingFile,
        newComp.stirlingFile,
      ];
      prepareWorkbenchForRun(
        baseId,
        compId,
        newBase.stirlingFile,
        newComp.stirlingFile,
      );
      requestAnimationFrame(() => {
        navigationActions.setWorkbench(CUSTOM_WORKBENCH_ID);
      });
      void operation.executeOperation(
        { ...params, baseFileId: baseId, comparisonFileId: compId },
        selected,
      );
    }
  }, [
    baseSlot,
    compSlot,
    navigationActions,
    operation,
    params,
    prepareWorkbenchForRun,
  ]);

  const handleSwap = useCallback(() => {
    if (!baseSlot || !compSlot) return;
    if (operation.result) {
      setSwapConfirmOpen(true);
      return;
    }
    performSwap();
  }, [baseSlot, compSlot, operation.result, performSwap]);

  const clearSlot = useCallback((role: "base" | "comparison") => {
    if (role === "base") setBaseSlot(null);
    else setCompSlot(null);
  }, []);

  const renderSlot = useCallback(
    (role: "base" | "comparison") => {
      const slot = role === "base" ? baseSlot : compSlot;
      const otherSlot = role === "base" ? compSlot : baseSlot;
      const stub = slot?.stub;

      if (stub) {
        const dateMs = (stub.lastModified || stub.createdAt) ?? null;
        const dateText = dateMs
          ? new Date(dateMs).toLocaleDateString(undefined, {
              month: "short",
              day: "2-digit",
              year: "numeric",
            })
          : "";
        const pageCount = stub.processedFile?.totalPages || null;

        return (
          <Box
            data-testid={`compare-slot-${role}`}
            data-slot-state="filled"
            data-slot-filename={stub?.name}
            style={{
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              padding: "0.75rem 1rem",
              background: "var(--bg-surface)",
              width: "100%",
              minHeight: "9rem",
              position: "relative",
            }}
          >
            <ActionIcon
              variant="subtle"
              size="xs"
              style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}
              onClick={() => clearSlot(role)}
              aria-label={t("compare.clearSlot", "Remove file")}
            >
              <CloseIcon fontSize="small" />
            </ActionIcon>
            <Group align="flex-start" wrap="nowrap" gap="md">
              <Box style={{ alignSelf: "center" }}>
                <DocumentThumbnail
                  file={stub}
                  thumbnail={stub.thumbnailUrl || null}
                />
              </Box>
              <Stack style={{ minWidth: 0, overflow: "hidden", flex: 1 }}>
                <Text fw={600} title={stub.name}>
                  {truncateCenter(stub.name || "", 50)}
                </Text>
                {pageCount && dateText && (
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {pageCount} {t("compare.pages", "pages")}
                    <br />
                    {dateText}
                  </Text>
                )}
              </Stack>
            </Group>
          </Box>
        );
      }

      const isDisabled = role === "comparison" && !baseSlot;

      return (
        <FileSelectorPicker
          placeholder={
            isDisabled
              ? t("compare.edited.selectBaseFirst", "Select original PDF first")
              : t(
                  role === "base"
                    ? "compare.original.placeholder"
                    : "compare.edited.placeholder",
                  role === "base"
                    ? "Select the original PDF"
                    : "Select the edited PDF",
                )
          }
          excludeIds={
            otherSlot ? [otherSlot.stirlingFile.fileId as string] : []
          }
          disabled={isDisabled}
          onSelect={(result: FileSelectorResult) => {
            if (role === "base") setBaseSlot(result);
            else setCompSlot(result);
          }}
        />
      );
    },
    [baseSlot, compSlot, clearSlot, t],
  );
  const canExecute = Boolean(
    baseSlot &&
    compSlot &&
    baseSlot.stirlingFile.fileId !== compSlot.stirlingFile.fileId &&
    !base.operation.isLoading &&
    base.endpointEnabled !== false,
  );

  const hasBothSelected = Boolean(baseSlot && compSlot);
  const hasAnySelected = Boolean(baseSlot || compSlot);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: false,
    },
    steps: [
      {
        title: t(
          "compare.selection.originalEditedTitle",
          "Select Original and Edited PDFs",
        ),
        isVisible: true,
        content: (
          <Stack gap="sm" className="compare-step-selection">
            <div className="compare-step-selection__clear-row">
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() => setClearConfirmOpen(true)}
                disabled={!hasAnySelected}
                styles={{ root: { textDecoration: "underline" } }}
                style={{
                  background: !hasAnySelected ? "transparent" : undefined,
                  color: !hasAnySelected
                    ? "var(--spdf-clear-disabled-text)"
                    : undefined,
                }}
              >
                {t("compare.clearSelected", "Clear selected")}
              </Button>
            </div>

            <Text fw={700} size="sm" style={{ margin: 0 }}>
              {t("compare.original.label", "Original PDF")}
            </Text>

            <div className="compare-step-selection__thumbs-row">
              <Stack gap="sm" className="compare-step-selection__thumbs-col">
                {renderSlot("base")}
                <Text fw={700} size="sm" style={{ margin: 0 }}>
                  {t("compare.edited.label", "Edited PDF")}
                </Text>
                {renderSlot("comparison")}
              </Stack>

              {hasBothSelected && (
                <button
                  type="button"
                  className="compare-step-selection__swap"
                  onClick={handleSwap}
                  disabled={base.operation.isLoading}
                  aria-label={t("compare.swap.label", "Swap")}
                >
                  <SwapVertRoundedIcon
                    className="compare-step-selection__swap-icon"
                    fontSize="inherit"
                  />
                  <span className="compare-step-selection__swap-label">
                    {t("compare.swap.label", "Swap")}
                  </span>
                </button>
              )}
            </div>

            <Modal
              opened={swapConfirmOpen}
              onClose={() => setSwapConfirmOpen(false)}
              title={t("compare.swap.confirmTitle", "Re-run comparison?")}
              centered
              size="sm"
            >
              <Stack gap="md">
                <Text>
                  {t(
                    "compare.swap.confirmBody",
                    "This will rerun the tool. Are you sure you want to swap the order of Original and Edited?",
                  )}
                </Text>
                <Group justify="flex-end" gap="sm">
                  <Button
                    variant="light"
                    onClick={() => setSwapConfirmOpen(false)}
                  >
                    {t("cancel", "Cancel")}
                  </Button>
                  <Button
                    variant="filled"
                    onClick={() => {
                      setSwapConfirmOpen(false);
                      performSwap();
                    }}
                  >
                    {t("compare.swap.confirm", "Swap and Re-run")}
                  </Button>
                </Group>
              </Stack>
            </Modal>

            <Modal
              opened={clearConfirmOpen}
              onClose={() => setClearConfirmOpen(false)}
              title={t("compare.clear.confirmTitle", "Clear selected PDFs?")}
              centered
              size="sm"
            >
              <Stack gap="md">
                <Text>
                  {t(
                    "compare.clear.confirmBody",
                    "This will clear the current file selections.",
                  )}
                </Text>
                <Group justify="flex-end" gap="sm">
                  <Button
                    variant="light"
                    onClick={() => setClearConfirmOpen(false)}
                  >
                    {t("cancel", "Cancel")}
                  </Button>
                  <Button
                    variant="filled"
                    onClick={() => {
                      setClearConfirmOpen(false);
                      performClearSelected();
                    }}
                  >
                    {t("compare.clear.confirm", "Clear")}
                  </Button>
                </Group>
              </Stack>
            </Modal>
          </Stack>
        ),
      },
    ],
    executeButton: {
      text: t("compare.cta", "Compare"),
      loadingText: t("compare.loading", "Comparing..."),
      onClick: handleExecuteCompare,
      disabled: !canExecute,
      // Explicitly null so the noFiles gate is bypassed — Compare manages its own slot state
      disabledReason:
        base.endpointEnabled === false ? "endpointUnavailable" : null,
      testId: "compare-execute",
      disableScopeHints: true,
    },
    review: {
      isVisible: false,
      operation: base.operation,
      title: t("compare.review.title", "Comparison Result"),
      onUndo: base.operation.undoOperation,
    },
  });
};

const CompareTool = Compare as ToolComponent;
CompareTool.tool = () => useCompareOperation;
CompareTool.getDefaultParameters = () => ({ ...compareDefaultParameters });

export default CompareTool;
