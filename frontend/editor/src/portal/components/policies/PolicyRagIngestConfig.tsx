import { useTranslation } from "react-i18next";
import { FormField, Input, Select, ToggleSwitch } from "@app/ui";

/** Configures the rag-ingest step: destination toggles, chunk sizing, parse tier. */
export interface RagIngestParams {
  chunkSize: string;
  overlap: string;
  mode: string;
  index: string;
  exportMarkdown: string;
  exportChunksJsonl: string;
}

interface PolicyRagIngestConfigProps {
  parameters: RagIngestParams;
  onChange: (parameters: RagIngestParams) => void;
}

export function PolicyRagIngestConfig({
  parameters,
  onChange,
}: PolicyRagIngestConfigProps) {
  const { t } = useTranslation();
  const flag = (value: string | undefined, fallback: boolean): boolean =>
    value === undefined ? fallback : value === "true";

  return (
    <div className="portal-policies__capability-config">
      <ToggleSwitch
        size="sm"
        checked={flag(parameters.index, true)}
        onChange={(checked) =>
          onChange({ ...parameters, index: String(checked) })
        }
        label={t("portal.policies.config.ragIngest.fields.index")}
        description={t("portal.policies.config.ragIngest.fields.indexHelp")}
      />
      <ToggleSwitch
        size="sm"
        checked={flag(parameters.exportMarkdown, false)}
        onChange={(checked) =>
          onChange({ ...parameters, exportMarkdown: String(checked) })
        }
        label={t("portal.policies.config.ragIngest.fields.exportMarkdown")}
        description={t(
          "portal.policies.config.ragIngest.fields.exportMarkdownHelp",
        )}
      />
      <ToggleSwitch
        size="sm"
        checked={flag(parameters.exportChunksJsonl, false)}
        onChange={(checked) =>
          onChange({ ...parameters, exportChunksJsonl: String(checked) })
        }
        label={t("portal.policies.config.ragIngest.fields.exportChunks")}
        description={t(
          "portal.policies.config.ragIngest.fields.exportChunksHelp",
        )}
      />
      <FormField
        label={t("portal.policies.config.ragIngest.fields.chunkSize")}
        helperText={t("portal.policies.config.ragIngest.fields.chunkSizeHelp")}
      >
        <Input
          type="number"
          inputSize="sm"
          min={64}
          step={64}
          value={parameters.chunkSize ?? ""}
          onChange={(e) =>
            onChange({ ...parameters, chunkSize: e.target.value })
          }
        />
      </FormField>
      <FormField
        label={t("portal.policies.config.ragIngest.fields.overlap")}
        helperText={t("portal.policies.config.ragIngest.fields.overlapHelp")}
      >
        <Input
          type="number"
          inputSize="sm"
          min={0}
          step={16}
          value={parameters.overlap ?? ""}
          onChange={(e) => onChange({ ...parameters, overlap: e.target.value })}
        />
      </FormField>
      <FormField
        label={t("portal.policies.config.ragIngest.fields.mode.label")}
        helperText={t("portal.policies.config.ragIngest.fields.mode.help")}
      >
        <Select
          inputSize="sm"
          value={parameters.mode || "auto"}
          onChange={(value) =>
            onChange({ ...parameters, mode: value ?? "auto" })
          }
          options={[
            {
              value: "auto",
              label: t("portal.policies.config.ragIngest.fields.mode.auto"),
            },
            {
              value: "basic",
              label: t("portal.policies.config.ragIngest.fields.mode.basic"),
            },
            {
              value: "advanced",
              label: t("portal.policies.config.ragIngest.fields.mode.advanced"),
            },
          ]}
        />
      </FormField>
    </div>
  );
}
