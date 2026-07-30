import { useTranslation } from "react-i18next";
import { FormField, Input, Select, ToggleSwitch } from "@app/ui";

/** Parameters for the "Ingest into knowledge base" pipeline step. */
export interface RagIngestParams {
  chunkSize?: number;
  overlap?: number;
  mode?: string;
  index?: boolean;
  exportMarkdown?: boolean;
  exportChunksJsonl?: boolean;
}

interface RagIngestStepConfigProps {
  parameters: RagIngestParams;
  onChange: (parameters: RagIngestParams) => void;
}

/** Settings for the rag-ingest step: destination toggles, chunking knobs, parse tier. */
export function RagIngestStepConfig({
  parameters,
  onChange,
}: RagIngestStepConfigProps) {
  const { t } = useTranslation();
  const setNumber = (key: "chunkSize" | "overlap", raw: string) => {
    const value = Number(raw);
    onChange({
      ...parameters,
      [key]: Number.isFinite(value) && raw !== "" ? value : undefined,
    });
  };
  return (
    <div className="portal-policies__capability-config">
      <ToggleSwitch
        size="sm"
        checked={parameters.index ?? true}
        onChange={(checked) => onChange({ ...parameters, index: checked })}
        label={t("portal.pipelines.builder.docIntelligence.index")}
        description={t("portal.pipelines.builder.docIntelligence.indexHint")}
      />
      <ToggleSwitch
        size="sm"
        checked={parameters.exportMarkdown ?? false}
        onChange={(checked) =>
          onChange({ ...parameters, exportMarkdown: checked })
        }
        label={t("portal.pipelines.builder.docIntelligence.exportMarkdown")}
        description={t(
          "portal.pipelines.builder.docIntelligence.exportMarkdownHint",
        )}
      />
      <ToggleSwitch
        size="sm"
        checked={parameters.exportChunksJsonl ?? false}
        onChange={(checked) =>
          onChange({ ...parameters, exportChunksJsonl: checked })
        }
        label={t("portal.pipelines.builder.docIntelligence.exportChunks")}
        description={t(
          "portal.pipelines.builder.docIntelligence.exportChunksHint",
        )}
      />
      <FormField
        label={t("portal.pipelines.builder.docIntelligence.chunkSize")}
      >
        <Input
          type="number"
          inputSize="sm"
          min={64}
          max={32768}
          value={parameters.chunkSize ?? ""}
          onChange={(e) => setNumber("chunkSize", e.target.value)}
        />
      </FormField>
      <FormField label={t("portal.pipelines.builder.docIntelligence.overlap")}>
        <Input
          type="number"
          inputSize="sm"
          min={0}
          max={4096}
          value={parameters.overlap ?? ""}
          onChange={(e) => setNumber("overlap", e.target.value)}
        />
      </FormField>
      <FormField label={t("portal.pipelines.builder.docIntelligence.mode")}>
        <Select
          value={parameters.mode ?? "auto"}
          onChange={(value) =>
            onChange({ ...parameters, mode: value ?? "auto" })
          }
          options={[
            {
              value: "auto",
              label: t("portal.pipelines.builder.docIntelligence.modeAuto"),
            },
            {
              value: "basic",
              label: t("portal.pipelines.builder.docIntelligence.modeBasic"),
            },
            {
              value: "advanced",
              label: t("portal.pipelines.builder.docIntelligence.modeAdvanced"),
            },
          ]}
        />
      </FormField>
      <p className="portal-pipelines__step-hint">
        {t("portal.pipelines.builder.docIntelligence.ragIngestHint")}
      </p>
    </div>
  );
}
