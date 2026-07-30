import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import type { BaseToolProps } from "@app/types/tool";
import ParseDocumentSettings from "@app/components/tools/docparse/ParseDocumentSettings";
import { useParseDocumentParameters } from "@app/hooks/tools/parseDocument/useParseDocumentParameters";
import { useParseDocumentOperation } from "@app/hooks/tools/parseDocument/useParseDocumentOperation";

const ParseDocument = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "parseDocument",
    useParseDocumentParameters,
    useParseDocumentOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("parseDocument.settings.title", "Parse settings"),
        isCollapsed: false,
        content: (
          <ParseDocumentSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("parseDocument.submit", "Parse document"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("parseDocument.results.title", "Parsed output"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ParseDocument;
