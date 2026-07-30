import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Group, Stack, Text } from "@mantine/core";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import type { BaseToolProps } from "@app/types/tool";
import ExtractFieldsSettings from "@app/components/tools/docparse/ExtractFieldsSettings";
import { useExtractFieldsParameters } from "@app/hooks/tools/extractFields/useExtractFieldsParameters";
import { useExtractFieldsOperation } from "@app/hooks/tools/extractFields/useExtractFieldsOperation";
import type { ExtractFieldsResult } from "@app/hooks/tools/extractFields/extractFieldsOperationConfig";

/** Badge color mirroring the portal's confidence tones. */
const confidenceColor = (confidence: number): string => {
  if (confidence < 0.6) return "red";
  if (confidence < 0.85) return "yellow";
  return "green";
};

const ExtractFields = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "extractFields",
    useExtractFieldsParameters,
    useExtractFieldsOperation,
    props,
  );

  // The processor stores the extraction report as the result file; re-read it
  // here so the fields render inline with confidence and quotes.
  const [result, setResult] = useState<ExtractFieldsResult | null>(null);
  const resultFile = base.operation.files[0] ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!resultFile) {
      setResult(null);
      return;
    }
    resultFile
      .text()
      .then((text) => {
        if (!cancelled) setResult(JSON.parse(text) as ExtractFieldsResult);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resultFile]);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
    },
    steps: [
      {
        title: t("extractFields.settings.title", "Extraction schema"),
        isCollapsed: false,
        content: (
          <ExtractFieldsSettings
            parameters={base.params.parameters}
            onParameterChange={base.params.updateParameter}
            disabled={base.endpointLoading}
            selectedFile={base.selectedFiles[0] ?? null}
          />
        ),
      },
      {
        title: t("extractFields.resultsPanel.title", "Extracted fields"),
        isVisible: base.hasResults && result !== null,
        isCollapsed: false,
        content: (
          <Stack gap="sm">
            {(result?.fields ?? []).map((field) => (
              <Stack key={field.name} gap={2}>
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" fw={600} style={{ flex: 1 }} truncate>
                    {field.name}
                  </Text>
                  <Badge
                    size="sm"
                    variant="light"
                    color={confidenceColor(field.confidence)}
                  >
                    {Math.round(field.confidence * 100)}%
                  </Badge>
                </Group>
                <Text size="sm">{String(field.value ?? "-")}</Text>
                {field.citations?.[0]?.quote && (
                  <Text size="xs" c="dimmed" fs="italic">
                    &ldquo;{field.citations[0].quote}&rdquo;
                  </Text>
                )}
              </Stack>
            ))}
          </Stack>
        ),
      },
    ],
    executeButton: {
      text: t("extractFields.submit", "Extract fields"),
      isVisible: !base.hasResults,
      loadingText: t("loading"),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t("extractFields.results.title", "Extraction report"),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

export default ExtractFields;
