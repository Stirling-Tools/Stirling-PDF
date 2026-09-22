import { useTranslation } from "react-i18next";
import { Banner, FormField, Input, ToggleSwitch } from "@app/ui";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import type { IngestStepParams } from "@portal/components/pipelines/docparseStep";

interface IngestStepConfigProps {
  parameters: IngestStepParams;
  editorInput?: boolean;
  onChange: (parameters: IngestStepParams) => void;
}

/** Settings for the ingest step: what it produces and how it chunks. */
export function IngestStepConfig({
  parameters,
  editorInput = false,
  onChange,
}: IngestStepConfigProps) {
  const { t } = useTranslation();
  const { config, loading } = useAppConfig();
  const available = Boolean(config?.aiEngineEnabled);
  const chunkSize = parameters.chunkSize ?? 512;
  const overlap = parameters.overlap ?? 64;
  const index = parameters.index !== false;
  const markdown = parameters.exportMarkdown === true;
  const chunksJsonl = parameters.exportChunksJsonl === true;

  const setNumber = (key: "chunkSize" | "overlap", raw: string) => {
    const value = Number(raw);
    onChange({
      ...parameters,
      [key]: Number.isFinite(value) && raw !== "" ? value : undefined,
    });
  };

  const overlapTooBig = overlap >= chunkSize;
  const includeOriginal = parameters.includeOriginal !== false;
  const doesNothing = (!index || !includeOriginal) && !markdown && !chunksJsonl;

  return (
    <div className="portal-policies__capability-config">
      {!loading && !available && (
        <Banner
          tone="warning"
          description={t("portal.pipelines.builder.ingest.unavailable")}
        />
      )}
      {editorInput && (
        <Banner
          tone="info"
          description={t(
            "portal.pipelines.builder.ingest.editorPdfOnly",
            "Editor policies return PDFs only. To export chunks or Markdown, choose a saved input source and a file destination.",
          )}
        />
      )}
      {(!editorInput || !includeOriginal) && (
        <ToggleSwitch
          size="sm"
          checked={includeOriginal}
          onChange={(checked) =>
            onChange({ ...parameters, includeOriginal: checked })
          }
          label={t("portal.pipelines.builder.ingest.includeOriginal")}
          description={t("portal.pipelines.builder.ingest.includeOriginalHint")}
        />
      )}
      <ToggleSwitch
        size="sm"
        checked={index}
        onChange={(checked) => onChange({ ...parameters, index: checked })}
        label={t("portal.pipelines.builder.ingest.index")}
        description={t("portal.pipelines.builder.ingest.indexHint")}
      />
      {(!editorInput || markdown) && (
        <ToggleSwitch
          size="sm"
          checked={markdown}
          onChange={(checked) =>
            onChange({ ...parameters, exportMarkdown: checked })
          }
          label={t("portal.pipelines.builder.ingest.exportMarkdown")}
          description={t("portal.pipelines.builder.ingest.exportMarkdownHint")}
        />
      )}
      {(!editorInput || chunksJsonl) && (
        <ToggleSwitch
          size="sm"
          checked={chunksJsonl}
          onChange={(checked) =>
            onChange({ ...parameters, exportChunksJsonl: checked })
          }
          label={t("portal.pipelines.builder.ingest.exportChunks")}
          description={t("portal.pipelines.builder.ingest.exportChunksHint")}
        />
      )}
      {doesNothing && (
        <p className="portal-pipelines__step-hint">
          {t("portal.pipelines.builder.ingest.nothingToDo")}
        </p>
      )}
      <FormField
        label={t("portal.pipelines.builder.ingest.chunkSize")}
        helperText={t("portal.pipelines.builder.ingest.chunkSizeHint")}
      >
        <Input
          type="number"
          inputSize="sm"
          min={64}
          max={32768}
          step={64}
          value={parameters.chunkSize ?? ""}
          onChange={(e) => setNumber("chunkSize", e.target.value)}
        />
      </FormField>
      <FormField
        label={t("portal.pipelines.builder.ingest.overlap")}
        helperText={t("portal.pipelines.builder.ingest.overlapHint")}
        error={
          overlapTooBig
            ? t("portal.pipelines.builder.ingest.overlapTooBig", {
                chunkSize,
              })
            : undefined
        }
      >
        <Input
          type="number"
          inputSize="sm"
          min={0}
          max={4096}
          invalid={overlapTooBig}
          step={16}
          value={parameters.overlap ?? ""}
          onChange={(e) => setNumber("overlap", e.target.value)}
        />
      </FormField>
    </div>
  );
}
