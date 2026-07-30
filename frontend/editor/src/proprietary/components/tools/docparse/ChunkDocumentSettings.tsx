import { useTranslation } from "react-i18next";
import { Anchor, List, NumberInput, Select, Stack, Text } from "@mantine/core";
import type { ToolAutomationSettingsProps } from "@app/hooks/tools/shared/toolOperationTypes";
import type { ChunkDocumentParameters } from "@app/hooks/tools/chunkDocument/useChunkDocumentParameters";
import type { DocparseMode } from "@app/hooks/tools/parseDocument/useParseDocumentParameters";
import DocparseToolIntro from "@app/components/tools/docparse/DocparseToolIntro";

const ChunkDocumentSettings = ({
  parameters,
  onParameterChange,
  disabled,
}: ToolAutomationSettingsProps<ChunkDocumentParameters>) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <DocparseToolIntro
        description={t(
          "chunkDocument.intro",
          "Turns a document into retrieval-ready chunks in three layers, so answers cite the right section instead of a random page.",
        )}
        aiBadge="layout"
      />
      <List type="ordered" size="sm" spacing={4}>
        <List.Item>
          {t(
            "chunkDocument.layers.parse",
            "Layout-aware parse: headings, paragraphs, and tables are recognized as structure",
          )}
        </List.Item>
        <List.Item>
          {t(
            "chunkDocument.layers.chunk",
            "Structure-aware chunks: each carries its heading breadcrumb and page range",
          )}
        </List.Item>
        <List.Item>
          {t(
            "chunkDocument.layers.embed",
            "Ready to embed: exported as JSONL for any vector store",
          )}
        </List.Item>
      </List>
      <NumberInput
        label={t("chunkDocument.chunkSize.label", "Chunk size (characters)")}
        value={parameters.chunkSize}
        onChange={(value) =>
          onParameterChange("chunkSize", typeof value === "number" ? value : 0)
        }
        min={1}
        disabled={disabled}
      />
      <NumberInput
        label={t("chunkDocument.overlap.label", "Overlap (characters)")}
        value={parameters.overlap}
        onChange={(value) =>
          onParameterChange("overlap", typeof value === "number" ? value : 0)
        }
        min={0}
        disabled={disabled}
      />
      <Select
        label={t("chunkDocument.mode.label", "Mode")}
        value={parameters.mode}
        onChange={(value) =>
          onParameterChange("mode", (value ?? "auto") as DocparseMode)
        }
        data={[
          { value: "auto", label: t("chunkDocument.mode.auto", "Auto") },
          { value: "basic", label: t("chunkDocument.mode.basic", "Basic") },
          {
            value: "advanced",
            label: t("chunkDocument.mode.advanced", "Advanced"),
          },
        ]}
        disabled={disabled}
      />
      <Text size="xs" c="dimmed">
        {t(
          "chunkDocument.processorCallout",
          "To index automatically, add the 'Index into knowledge base' step to an ingestion policy in the",
        )}{" "}
        <Anchor href="/processor/policies" size="xs">
          {t("chunkDocument.processorLink", "Processor")}
        </Anchor>
      </Text>
    </Stack>
  );
};

export default ChunkDocumentSettings;
