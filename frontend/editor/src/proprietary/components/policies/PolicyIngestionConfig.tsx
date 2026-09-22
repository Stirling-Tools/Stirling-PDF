import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Collapsible, FormField, Input, Select } from "@app/ui";
import type { PolicyParams } from "@app/policies/operations";
import { getSettingsUrl } from "@app/utils/settingsNavigation";

export type IngestionDestination = "builtin" | "external" | "export";

interface Props {
  parameters: PolicyParams<"ingest">;
  target: IngestionDestination;
  onTargetChange: (target: IngestionDestination) => void;
  onChange: (key: "chunkSize" | "overlap", value: string) => void;
  engineReady: boolean;
  indexingReady: boolean;
  chunkingReady: boolean;
  checking: boolean;
  recheck: () => void;
  allowExternal?: boolean;
  children?: ReactNode;
}

/** Guided ingestion choices, including setup recovery and chunk parameters. */
export function PolicyIngestionConfig({
  parameters,
  target,
  onTargetChange,
  onChange,
  engineReady,
  indexingReady,
  chunkingReady,
  checking,
  recheck,
  allowExternal = true,
  children,
}: Props) {
  const { t } = useTranslation();
  const [advanced, setAdvanced] = useState(false);
  return (
    <div className="portal-policies__capability-settings">
      <FormField
        label={t("portal.policies.wizard.locations.outputType", "Output type")}
      >
        <Select
          inputSize="sm"
          value={target}
          onChange={(value) =>
            value && onTargetChange(value as IngestionDestination)
          }
          options={[
            {
              value: "builtin",
              label: t(
                "portal.policies.wizard.locations.builtin",
                "Stirling knowledge base",
              ),
            },
            {
              value: "external",
              label: t(
                "portal.policies.wizard.locations.external",
                "Connected vector database",
              ),
            },
            {
              value: "export",
              label: t(
                "portal.policies.wizard.locations.export",
                "Export chunks without a database",
              ),
            },
          ].filter(
            (option) =>
              allowExternal ||
              option.value !== "external" ||
              target === "external",
          )}
        />
      </FormField>
      <p className="portal-policies__wizard-desc">
        {t(`portal.policies.wizard.locations.${target}Help`)}
      </p>
      {children}
      {checking ? (
        <p role="status">
          {t(
            "portal.policies.wizard.locations.checking",
            "Checking ingestion availability...",
          )}
        </p>
      ) : (
        (!engineReady || (parameters.index !== "false" && !indexingReady)) && (
          <Banner
            tone="warning"
            description={
              !engineReady
                ? t(
                    "portal.policies.wizard.locations.engineUnavailable",
                    "The AI engine is disabled or unreachable. Enable it to prepare chunks, or turn off knowledge search to run OCR only.",
                  )
                : t(
                    "portal.policies.wizard.locations.indexingUnavailable",
                    "The built-in knowledge base needs an embedding provider. Configure one in AI settings, connect a vector database, or export chunks without a database.",
                  )
            }
          />
        )
      )}
      <div className="portal-policies__setup-actions">
        <a
          className="portal-policies__setup-link"
          href={getSettingsUrl(
            target === "builtin" ? "adminAiDocuments" : "adminAiGeneral",
          )}
          target="_blank"
          rel="noreferrer"
        >
          {t("portal.policies.wizard.locations.aiSettings", "Open AI settings")}
        </a>
        <Button size="sm" variant="tertiary" onClick={() => recheck()}>
          {t("portal.policies.wizard.locations.recheck", "Check again")}
        </Button>
      </div>
      <Collapsible
        open={advanced}
        onToggle={() => setAdvanced(!advanced)}
        header={t(
          "portal.policies.wizard.locations.chunkSettings",
          "Chunk settings",
        )}
      >
        <div className="portal-policies__capability-settings">
          <FormField label={t("portal.pipelines.builder.ingest.chunkSize")}>
            <Input
              type="number"
              min={64}
              max={32768}
              value={parameters.chunkSize}
              onChange={(event) => onChange("chunkSize", event.target.value)}
            />
          </FormField>
          <FormField label={t("portal.pipelines.builder.ingest.overlap")}>
            <Input
              type="number"
              min={0}
              max={4096}
              value={parameters.overlap}
              onChange={(event) => onChange("overlap", event.target.value)}
            />
          </FormField>
          {!chunkingReady && (
            <Banner
              tone="warning"
              description={t(
                "portal.policies.wizard.locations.invalidChunks",
                "Choose a chunk size from 64 to 32768 and an overlap from 0 to 4096 smaller than the chunk size.",
              )}
            />
          )}
        </div>
      </Collapsible>
    </div>
  );
}
