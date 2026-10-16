import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, FormField, Input } from "@app/ui";
import apiClient from "@app/services/apiClient";
import type { PolicySetupConfigProps } from "@app/components/policies/PolicySetupWizard";
import {
  PolicyIngestionConfig,
  type IngestionDestination,
} from "@app/components/policies/PolicyIngestionConfig";
import { ingestChunkingConfigured } from "@app/policies/ingestOperation";
import { policyStepFromWire } from "@app/policies/operations";

/** Folder ingestion settings for surfaces without Processor connection management. */
export function FolderIngestionSettings({
  result,
  onChange,
  onValidityChange,
  folderName,
}: PolicySetupConfigProps & { folderName: string }) {
  const { t } = useTranslation();
  const ingestion = result.steps
    .map(policyStepFromWire)
    .find((step) => step?.toolId === "ingest");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const parameters = ingestion ? { ...ingestion.params, ...draft } : null;
  const target: IngestionDestination = result.outputIds?.length
    ? "external"
    : ingestion?.params.index === "false"
      ? "export"
      : "builtin";
  const capabilities = useQuery({
    queryKey: ["folder-policy-docparse"],
    queryFn: async () =>
      (
        await apiClient.get<{
          enabled: boolean;
          engineReachable: boolean;
          indexingConfigured?: boolean;
        }>("/api/v1/docparse/capabilities")
      ).data,
    enabled: Boolean(ingestion),
    retry: false,
    staleTime: 0,
  });
  const engineReady = Boolean(
    capabilities.data?.enabled && capabilities.data.engineReachable,
  );
  const indexingReady = capabilities.data?.indexingConfigured === true;
  const chunkingReady =
    !ingestion ||
    ingestChunkingConfigured({
      chunkSize: Number(parameters?.chunkSize),
      overlap: Number(parameters?.overlap),
    });
  const valid =
    (!ingestion && target !== "external") ||
    (Boolean(ingestion) &&
      engineReady &&
      !capabilities.isFetching &&
      chunkingReady &&
      (ingestion?.params.index === "false" || indexingReady));
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);
  function patchIngestion(
    patch: Record<string, unknown>,
    next?: IngestionDestination,
  ) {
    onChange({
      ...(next
        ? {
            outputIds: [],
          }
        : {}),
      steps: result.steps.map((step) =>
        step.operation === "/api/v1/docparse/ingest"
          ? { ...step, parameters: { ...step.parameters, ...patch } }
          : step,
      ),
    });
  }
  const outputDestination =
    target === "external" ? (
      <>
        <FormField
          label={t(
            "portal.policies.wizard.locations.destination",
            "Destination",
          )}
          helperText={t(
            "portal.policies.wizard.locations.desktopExternal",
            "Manage this database connection in the web app’s Processor, or change the output type to return results to this folder.",
          )}
        >
          <Input
            inputSize="sm"
            value={t(
              "portal.policies.wizard.locations.savedDatabase",
              "Saved vector database",
            )}
            readOnly
          />
        </FormField>
        <Button
          size="sm"
          variant="tertiary"
          onClick={() =>
            onChange({
              outputIds: [],
            })
          }
        >
          {t(
            "portal.policies.wizard.locations.returnToFolder",
            "Return results to this folder",
          )}
        </Button>
      </>
    ) : (
      <FormField
        label={t("portal.policies.wizard.locations.destination", "Destination")}
        helperText={t(
          "portal.policies.wizard.locations.folderOutput",
          "Processed files are saved in this folder. Corpus exports keep the original PDF.",
        )}
      >
        <Input inputSize="sm" value={folderName} readOnly />
      </FormField>
    );

  return (
    <>
      <p className="portal-policies__wizard-desc">
        {t(
          "portal.policies.wizard.locations.folder",
          "Input: {{name}}. Originals are retained when delivering to a vector database.",
          { name: folderName },
        )}
      </p>
      <section
        className="portal-policies__wizard-section"
        aria-label={t("portal.policies.wizard.locations.output", "Output")}
      >
        <h3 className="portal-policies__wizard-heading">
          {t("portal.policies.wizard.locations.output", "Output")}
        </h3>
        {ingestion && parameters ? (
          <PolicyIngestionConfig
            parameters={parameters}
            target={target}
            allowExternal={false}
            engineReady={engineReady}
            indexingReady={indexingReady}
            chunkingReady={chunkingReady}
            checking={capabilities.isFetching}
            recheck={() => void capabilities.refetch()}
            onTargetChange={(next) =>
              patchIngestion(
                {
                  index: next === "builtin",
                  includeOriginal: true,
                  exportChunksJsonl: next === "export",
                  exportMarkdown: false,
                },
                next,
              )
            }
            onChange={(key, value) => {
              const next = { ...parameters, [key]: value };
              setDraft({ ...draft, [key]: value });
              patchIngestion({
                chunkSize: Number(next.chunkSize),
                overlap: Number(next.overlap),
              });
            }}
          >
            {outputDestination}
          </PolicyIngestionConfig>
        ) : (
          outputDestination
        )}
      </section>
    </>
  );
}
