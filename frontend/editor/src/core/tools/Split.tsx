import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import SplitSettings from "@app/components/tools/split/SplitSettings";
import { SplitIntentPicker } from "@app/components/tools/split/SplitIntentPicker";
import { SplitVariantPicker } from "@app/components/tools/split/SplitVariantPicker";
import {
  SplitOutcomeSummary,
  splitOutcomeBlocksRun,
} from "@app/components/tools/split/SplitOutcomeSummary";
import { computeSplitOutcome } from "@app/components/tools/split/splitOutcome";
import { useSplitParameters } from "@app/hooks/tools/split/useSplitParameters";
import { useSplitOperation } from "@app/hooks/tools/split/useSplitOperation";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useSplitMethodTips } from "@app/components/tooltips/useSplitMethodTips";
import { useStirlingFileStub } from "@app/contexts/file/fileHooks";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import type { FileId } from "@app/types/fileContext";
import {
  type SplitMethod,
  SPLIT_INTENTS,
  SPLIT_METHODS,
  ENDPOINTS,
  METHOD_OPTIONS,
  intentForMethod,
  type SplitIntentId,
} from "@app/constants/splitConstants";
import { useMultipleEndpointsEnabled } from "@app/hooks/useEndpointConfig";

/** Stand-in id for "no file selected", so the stub lookup hook is always called. */
const NO_FILE_ID = "" as FileId;

/** Which unit a split value is expressed in, so switching families clears it. */
const VALUE_FAMILY: Partial<Record<SplitMethod, "size" | "count">> = {
  [SPLIT_METHODS.BY_SIZE]: "size",
  [SPLIT_METHODS.BY_PAGE_COUNT]: "count",
  [SPLIT_METHODS.BY_DOC_COUNT]: "count",
};

const Split = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "split",
    useSplitParameters,
    useSplitOperation,
    props,
  );

  // Check which split endpoints are available
  const allSplitEndpoints = useMemo(() => Object.values(ENDPOINTS), []);
  const { endpointStatus } = useMultipleEndpointsEnabled(allSplitEndpoints);

  // Hide a method (and a goal, when none of its methods remain) whose endpoint
  // is explicitly disabled. An unloaded status shows everything.
  const availableIntents = useMemo(() => {
    const enabled = new Set(
      METHOD_OPTIONS.filter(
        (option) => endpointStatus[ENDPOINTS[option.value]] !== false,
      ).map((option) => option.value),
    );
    return SPLIT_INTENTS.map((intent) => ({
      ...intent,
      methods: intent.methods.filter((method) => enabled.has(method)),
    })).filter((intent) => intent.methods.length > 0);
  }, [endpointStatus]);

  const method = base.params.parameters.method;
  const intent = intentForMethod(method);
  const availableIntent = availableIntents.find((i) => i.id === intent?.id);

  // The settings step shows what the loaded document can tell the user.
  const { record } = useStirlingFileStub(
    base.selectedFiles[0]?.fileId ?? NO_FILE_ID,
  );
  const totalPages = record?.processedFile?.totalPages ?? null;

  const outcome = useMemo(
    () => computeSplitOutcome(base.params.parameters, totalPages),
    [base.params.parameters, totalPages],
  );

  const methodTips = useSplitMethodTips();

  const handleSelectIntent = (intentId: SplitIntentId) => {
    const next = availableIntents.find((item) => item.id === intentId);
    if (!next) return;
    base.params.updateParameter("method", next.methods[0]);
  };

  const handleSelectVariant = (next: SplitMethod) => {
    const currentFamily = method ? VALUE_FAMILY[method] : undefined;
    const nextFamily = VALUE_FAMILY[next];
    // A page count is not a size; drop the old value rather than carry a unit
    // the next field cannot accept.
    if (currentFamily && nextFamily && currentFamily !== nextFamily) {
      base.params.updateParameter("splitValue", "");
    }
    base.params.updateParameter("method", next);
  };

  const variantLabel = method
    ? t(intent?.variantLabelKeys[method] ?? method, method)
    : t("split.steps.settings", "Settings");

  const settingsTitle = intent
    ? `${t("split.steps.settings", "Settings")} · ${variantLabel}`
    : t("split.steps.settings", "Settings");

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: intent
          ? t(intent.titleKey)
          : t("split.steps.chooseMethod", "Choose method"),
        isCollapsed: !!method,
        onCollapsedClick: () => base.params.updateParameter("method", null),
        tooltip: methodTips,
        content: (
          <SplitIntentPicker
            value={availableIntent?.id ?? intent?.id ?? null}
            onChange={handleSelectIntent}
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: settingsTitle,
        isCollapsed: !method,
        onCollapsedClick: base.hasResults
          ? base.handleSettingsReset
          : undefined,
        content: method && intent && (
          <SplitSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
            variantPicker={
              availableIntent && availableIntent.methods.length > 1 ? (
                <SplitVariantPicker
                  intent={availableIntent}
                  method={method}
                  onChange={handleSelectVariant}
                  disabled={base.endpointLoading}
                />
              ) : undefined
            }
          />
        ),
      },
    ],
    preview: <SplitOutcomeSummary outcome={outcome} />,
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
