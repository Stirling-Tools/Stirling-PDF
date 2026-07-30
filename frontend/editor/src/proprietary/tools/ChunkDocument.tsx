import { useTranslation } from "react-i18next";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import type { BaseToolProps } from "@app/types/tool";
import ChunkDocumentSettings from "@app/components/tools/docparse/ChunkDocumentSettings";
import { useChunkDocumentParameters } from "@app/hooks/tools/chunkDocument/useChunkDocumentParameters";
import { useChunkDocumentOperation } from "@app/hooks/tools/chunkDocument/useChunkDocumentOperation";

const ChunkDocument = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "chunkDocument",
    useChunkDocumentParameters,
    useChunkDocumentOperation,
    props,
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("chunkDocument.settings.title", "Chunking settings"),
        isCollapsed: false,
        content: (
          <ChunkDocumentSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
          />
        ),
      },
    ],
    executeButton: {
      text: t("chunkDocument.submit", "Prepare chunks"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("chunkDocument.results.title", "Chunks (JSONL)"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ChunkDocument;
