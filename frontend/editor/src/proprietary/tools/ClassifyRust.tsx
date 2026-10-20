import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { useClassifyRustParameters } from "@app/hooks/tools/classifyRust/useClassifyRustParameters";
import { useClassifyRustOperation } from "@app/hooks/tools/classifyRust/useClassifyRustOperation";
import ProcessOnServerSetting from "@app/components/tools/shared/ProcessOnServerSetting";
import ToolTimingPanel from "@app/components/tools/shared/ToolTimingPanel";
import ClassifyRustResultsPanel from "@app/components/tools/classifyRust/ClassifyRustResultsPanel";
import { onTiming, type ToolTiming } from "@app/services/toolTiming";
import {
  onResults,
  type ClassifyRustResult,
} from "@app/services/classifyRustResults";

/**
 * The rule-based Rust classifier, in the browser or on the server. Each file's
 * verdict is shown beside the current TypeScript heuristic's for comparison,
 * and the output files carry the Rust verdict in their metadata, as the
 * pipeline step's do.
 */
const ClassifyRust = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "classifyRust",
    useClassifyRustParameters,
    useClassifyRustOperation,
    props,
  );

  const [timing, setTiming] = useState<ToolTiming | null>(null);
  const [results, setResults] = useState<ClassifyRustResult[] | null>(null);
  useEffect(() => onTiming("classify", "rust", setTiming), []);
  useEffect(() => onResults(setResults), []);
  useEffect(() => {
    if (!base.hasResults) {
      setTiming(null);
      setResults(null);
    }
  }, [base.hasResults]);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("rustTools.processing", "Processing"),
        isCollapsed: base.hasResults,
        content: (
          <ProcessOnServerSetting
            processOnServer={base.params.parameters.processOnServer}
            onChange={(value) =>
              base.params.updateParameter("processOnServer", value)
            }
            disabled={base.endpointLoading}
          />
        ),
      },
      {
        title: t("classifyRust.results.title", "Classification"),
        isVisible: base.hasResults && results !== null,
        isCollapsed: false,
        content: results ? (
          <ClassifyRustResultsPanel results={results} />
        ) : null,
      },
      {
        title: t("toolTiming.title", "Timing"),
        isVisible: base.hasResults && timing !== null,
        isCollapsed: false,
        content: timing ? <ToolTimingPanel timing={timing} /> : null,
      },
    ],
    executeButton: {
      text: t("classifyRust.submit", "Classify"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      paramsValid: true,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("classifyRust.review.title", "Labelled PDFs"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ClassifyRust as ToolComponent;
