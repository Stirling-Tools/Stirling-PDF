import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import SplitSettings from "@app/components/tools/split/SplitSettings";
import { SplitMethodPicker } from "@app/components/tools/split/SplitMethodPicker";
import {
  SplitOutcomeSummary,
  splitOutcomeBlocksRun,
} from "@app/components/tools/split/SplitOutcomeSummary";
import { computeSplitOutcome } from "@app/components/tools/split/splitOutcome";
import { useSplitParameters } from "@app/hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "@app/hooks/tools/split/useSplitOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useStirlingFileStub } from "@app/contexts/file/fileHooks";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import type { FileId } from "@app/types/fileContext";
import {
  type SplitMethod,
  PRIMARY_SPLIT_CHOICES,
  MORE_SPLIT_CHOICES,
  SPLIT_METHODS,
  ENDPOINTS,
  METHOD_OPTIONS,
} from "@app/constants/splitConstants";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";

/** Stand-in id for "no file selected", so the stub lookup hook is always called. */
const NO_FILE_ID = "" as FileId;

const Split = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "split",
    useSplitParameters,
    useSplitOperation,
    props,
  );

  // Hide a choice whose endpoint is explicitly disabled; an unloaded status
  // shows everything.
  const allSplitEndpoints = useMemo(() => Object.values(ENDPOINTS), []);
  const { endpointStatus } = useMultipleEndpointsEnabled(allSplitEndpoints);
  const available = useMemo(
    () =>
      new Set(
        METHOD_OPTIONS.filter(
          (option) => endpointStatus[ENDPOINTS[option.value]] !== false,
        ).map((option) => option.value),
      ),
    [endpointStatus],
  );
  const primaryChoices = PRIMARY_SPLIT_CHOICES.filter((choice) =>
    available.has(choice.method),
  );
  const moreChoices = MORE_SPLIT_CHOICES.filter((choice) =>
    available.has(choice.method),
  );

  const parameters = base.params.parameters;
  const method: SplitMethod = parameters.method ?? SPLIT_METHODS.BY_DOC_COUNT;

  // The settings step shows what the loaded document can tell the user.
  const { record } = useStirlingFileStub(
    base.selectedFiles[0]?.fileId ?? NO_FILE_ID,
  );
  const totalPages = record?.processedFile?.totalPages ?? null;

  const outcome = useMemo(
    () => computeSplitOutcome(parameters, totalPages),
    [parameters, totalPages],
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("split.steps.chooseMethod", "How to split"),
        content: (
          <Stack gap="md">
            <SplitMethodPicker
              primary={primaryChoices}
              more={moreChoices}
              value={method}
              onChange={(next) => base.params.updateParameter("method", next)}
              disabled={base.endpointLoading}
            />
            <SplitSettings
              parameters={parameters}
              onParameterChange={base.params.updateParameter}
              disabled={base.endpointLoading}
            />
            <SplitOutcomeSummary outcome={outcome} />
          </Stack>
        ),
      },
    ],
    executeButton: {
      text: t("split.submit", "Split PDF"),
      loadingText: t("loading"),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      endpointEnabled: base.endpointEnabled,
      // The summary knows things validateSplitParameters cannot (a page past
      // the end of this document), so it can veto the run too.
      paramsValid:
        base.params.validateParameters() && !splitOutcomeBlocksRun(outcome),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("split.resultsTitle", "Split Results"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default Split as ToolComponent;
