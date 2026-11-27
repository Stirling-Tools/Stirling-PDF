import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { Box, Group, Stack, Text, Modal } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { createToolFlow } from "@editor/components/tools/shared/createToolFlow";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import {
  useCompareParameters,
  defaultParameters as compareDefaultParameters,
} from "@editor/hooks/tools/compare/useCompareParameters";
import {
  useCompareOperation,
  CompareOperationHook,
} from "@editor/hooks/tools/compare/useCompareOperation";
import CompareWorkbenchView from "@editor/components/tools/compare/CompareWorkbenchView";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import type { FileId } from "@editor/types/file";
import type { StirlingFile } from "@editor/types/fileContext";
import type { CompareMode, CompareWorkbenchData } from "@editor/types/compare";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { getDefaultWorkbench } from "@editor/types/workbench";
import { truncateCenter } from "@editor/utils/textUtils";
import { registerPolicyFileUsage } from "@editor/services/policyBlockRegistry";
import {
  FileSelectorPicker as PopoverFileSelector,
  FileSelectorResult,
} from "@editor/components/shared/FileSelectorPicker";
import "@editor/components/tools/compare/compareView.css";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

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

  const compareIcon = useMemo(() => <Icon name="columns-2" size={20} />, []);
  const [swapConfirmOpen, setSwapConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Slot state — files loaded directly for comparison, never added to workbench
  const [baseSlot, setBaseSlot] = useState<FileSelectorResult | null>(null);
  const [compSlot, setCompSlot] = useState<FileSelectorResult | null>(null);
  useEffect(
    () =>
      registerPolicyFileUsage(
        [baseSlot, compSlot].flatMap((slot) => (slot ? [slot.stub] : [])),
      ),
    [baseSlot, compSlot],
  );

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
      label: t("compare.workbenchLabel", "Compare view"),
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
    const baseFileId = params.baseFileId;
    const comparisonFileId = params.comparisonFileId;

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

    // Operation finished without producing a fresh result (e.g. it errored).
    // Without this branch, `prepareWorkbenchForRun` leaves `isLoading: true`
    // and the workbench spins forever.
    const previous = lastWorkbenchDataRef.current;
    if (previous?.isLoading) {
      updateWorkbenchData({
        ...previous,
        baseFileId,
        comparisonFileId,
        baseLocalFile: baseSlot?.stirlingFile ?? previous.baseLocalFile ?? null,
        comparisonLocalFile:
          compSlot?.stirlingFile ?? previous.comparisonLocalFile ?? null,
        isLoading: false,
      });
    }
  }, [
    base.operation.isLoading,
    baseSlot,
    clearCustomWorkbenchViewData,
    compSlot,
    operation.errorMessage,
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
            className={`compare-slot ${privateContentClassName}`}
          >
            <Group align="center" wrap="nowrap" gap="xs">
              <Stack gap={2} className="compare-slot__meta">
                <Text
                  size="sm"
                  fw={600}
                  title={stub.name}
                  className="compare-slot__name"
                >
                  {truncateCenter(stub.name || "", 50)}
                </Text>
                {pageCount || dateText ? (
                  <Text size="xs" c="dimmed" className="compare-slot__details">
                    {pageCount
                      ? `${pageCount} ${t("compare.pages", "pages")}`
                      : null}
                    {pageCount && dateText ? " · " : null}
                    {dateText}
                  </Text>
                ) : null}
              </Stack>
              <ActionIcon
                variant="tertiary"
                accent="danger"
                size="sm"
                className="compare-slot__remove"
                onClick={() => clearSlot(role)}
                aria-label={t("compare.clearSlot", "Remove file")}
              >
                <Icon name="x" size={14} />
              </ActionIcon>
            </Group>
          </Box>
        );
      }

      const isDisabled = role === "comparison" && !baseSlot;

      return (
        <div
          data-testid={`compare-slot-${role}`}
          data-slot-state="empty"
          style={{ width: "100%" }}
        >
          <PopoverFileSelector
            testId={`compare-slot-${role}-add`}
            placeholder={
              isDisabled
                ? t(
                    "compare.edited.selectBaseFirst",
                    "Select original PDF first",
                  )
                : t(
                    role === "base"
                      ? "compare.original.placeholder"
                      : "compare.edited.placeholder",
                    role === "base"
                      ? "Select the original PDF"
                      : "Select the edited PDF",
                  )
            }
            excludeIds={otherSlot ? [otherSlot.stirlingFile.fileId] : []}
            disabled={isDisabled}
            onSelect={(result: FileSelectorResult) => {
              if (role === "base") setBaseSlot(result);
              else setCompSlot(result);
            }}
          />
        </div>
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
            <Text fw={500} size="sm">
              {t("compare.mode.label", "Comparison mode")}
            </Text>

            <ButtonSelector<CompareMode>
              value={params.mode}
              onChange={(mode) =>
                base.params.setParameters((prev) => ({ ...prev, mode }))
              }
              disabled={base.operation.isLoading}
              options={[
                {
                  value: "text",
                  label: t("compare.mode.text", "Text Comparison"),
                },
                {
                  value: "pixel",
                  label: t("compare.mode.pixel", "Pixel Comparison"),
                },
              ]}
            />

            <Text fw={500} size="sm">
              {t("compare.original.label", "Original PDF")}
            </Text>

            <Stack gap="sm" className="compare-step-selection__thumbs-col">
              {renderSlot("base")}

              {hasBothSelected && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSwap}
                  disabled={base.operation.isLoading}
                  leftSection={<Icon name="arrow-up-down" size={20} />}
                  style={{ alignSelf: "center" }}
                >
                  {t("compare.swap.label", "Swap")}
                </Button>
              )}

              <Text fw={500} size="sm">
                {t("compare.edited.label", "Edited PDF")}
              </Text>
              {renderSlot("comparison")}

              {hasAnySelected && (
                <Group justify="flex-end">
                  <Button
                    variant="quiet"
                    accent="neutral"
                    size="sm"
                    leftSection={<Icon name="circle-x" size={14} />}
                    onClick={() => setClearConfirmOpen(true)}
                  >
                    {t("compare.clearSelected", "Clear selected")}
                  </Button>
                </Group>
              )}
            </Stack>

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
                    variant="secondary"
                    onClick={() => setSwapConfirmOpen(false)}
                  >
                    {t("cancel", "Cancel")}
                  </Button>
                  <Button
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
                    variant="secondary"
                    onClick={() => setClearConfirmOpen(false)}
                  >
                    {t("cancel", "Cancel")}
                  </Button>
                  <Button
                    accent="danger"
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
