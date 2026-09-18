import { useTranslation } from "react-i18next";
import { Banner, FormField, Input, ToggleSwitch } from "@app/ui";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import type { RagIngestStepParams } from "@portal/components/pipelines/docparseStep";

interface RagIngestStepConfigProps {
  parameters: RagIngestStepParams;
  editorInput?: boolean;
  onChange: (parameters: RagIngestStepParams) => void;
}

/** Settings for the rag-ingest step: what it produces and how it chunks. */
export function RagIngestStepConfig({
  parameters,
  editorInput = false,
  onChange,
}: RagIngestStepConfigProps) {
  const { t } = useTranslation();
  const { config, loading } = useAppConfig();
  // DocParse has its own master switch, so the engine being on is not enough to run the step.
  const available =
    Boolean(config?.aiEngineEnabled) && config?.docparseEnabled !== false;
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
          description={t("portal.pipelines.builder.ragIngest.unavailable")}
        />
      )}
      {editorInput && (
        <Banner
          tone="info"
          description={t(
            "portal.pipelines.builder.ragIngest.editorPdfOnly",
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
          label={t("portal.pipelines.builder.ragIngest.includeOriginal")}
          description={t(
            "portal.pipelines.builder.ragIngest.includeOriginalHint",
          )}
        />
      )}
      <ToggleSwitch
        size="sm"
        checked={index}
        onChange={(checked) => onChange({ ...parameters, index: checked })}
        label={t("portal.pipelines.builder.ragIngest.index")}
        description={t("portal.pipelines.builder.ragIngest.indexHint")}
      />
      {(!editorInput || markdown) && (
        <ToggleSwitch
          size="sm"
          checked={markdown}
          onChange={(checked) =>
            onChange({ ...parameters, exportMarkdown: checked })
          }
          label={t("portal.pipelines.builder.ragIngest.exportMarkdown")}
          description={t(
            "portal.pipelines.builder.ragIngest.exportMarkdownHint",
          )}
        />
      )}
      {(!editorInput || chunksJsonl) && (
        <ToggleSwitch
          size="sm"
          checked={chunksJsonl}
          onChange={(checked) =>
            onChange({ ...parameters, exportChunksJsonl: checked })
          }
          label={t("portal.pipelines.builder.ragIngest.exportChunks")}
          description={t("portal.pipelines.builder.ragIngest.exportChunksHint")}
        />
      )}
      {doesNothing && (
        <p className="portal-pipelines__step-hint">
          {t("portal.pipelines.builder.ragIngest.nothingToDo")}
        </p>
      )}
      <FormField
        label={t("portal.pipelines.builder.ragIngest.chunkSize")}
        helperText={t("portal.pipelines.builder.ragIngest.chunkSizeHint")}
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
        label={t("portal.pipelines.builder.ragIngest.overlap")}
        helperText={
          overlapTooBig
            ? t("portal.pipelines.builder.ragIngest.overlapTooBig", {
                chunkSize,
              })
            : t("portal.pipelines.builder.ragIngest.overlapHint")
        }
      >
        <Input
          type="number"
          inputSize="sm"
          min={0}
          max={4096}
          step={16}
          value={parameters.overlap ?? ""}
          onChange={(e) => setNumber("overlap", e.target.value)}
        />
      </FormField>
    </div>
  );
}
