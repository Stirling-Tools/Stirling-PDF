import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Banner, Button, FormField, Input } from "@app/ui";
import type { PolicySetupConfigProps } from "@app/components/policies/PolicySetupWizard";
import { PolicyIngestionConfig } from "@app/components/policies/PolicyIngestionConfig";
import { EditorDeliverySelect } from "@portal/components/pipelines/EditorDeliverySelect";
import { DestinationPicker } from "@portal/components/pipelines/DestinationPicker";
import { availableOutputModes } from "@portal/components/pipelines/outputModes";
import { SourceModal } from "@portal/components/sources/SourceModal";
import { fetchSources } from "@portal/api/sources";
import { errorMessage } from "@portal/api/http";
import { qk } from "@portal/queries/keys";
import { usePolicySetupIngestion } from "@portal/components/policies/usePolicySetupIngestion";

interface Props extends PolicySetupConfigProps {
  folderName?: string;
}
const VECTOR_TYPES = ["vectordb"];

/** Owns output selection and its ingestion and editor-delivery constraints. */
export function PolicySetupOutput({
  result,
  onChange,
  onValidityChange,
  folderName,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [sourceModal, setSourceModal] = useState<{ id?: string } | null>(null);
  const sources = useQuery({ queryKey: qk.sources(), queryFn: fetchSources });
  const allSources = sources.data?.sources ?? [];
  const destination = allSources.find(
    (source) => source.id === result.outputIds?.[0],
  );
  const ingestion = usePolicySetupIngestion({
    result,
    onChange,
    folderName,
    destinationType: destination?.type,
  });
  const { external, requiresDestination } = ingestion;
  const editor = !folderName && result.runsOnEditor;
  const [destinationRequested, setDestinationRequested] = useState(false);
  const externalEditorOutput =
    editor &&
    (requiresDestination ||
      Boolean(result.outputIds?.length) ||
      destinationRequested);
  const outputSources = allSources.filter(
    (source) =>
      (availableOutputModes() as string[]).includes(source.type) &&
      (external ? source.type === "vectordb" : source.type !== "vectordb"),
  );
  const outputNeeded =
    externalEditorOutput ||
    (!editor && (!folderName || external || Boolean(result.outputIds?.length)));
  const outputReady =
    !outputNeeded ||
    (result.outputIds?.length === 1 &&
      outputSources.some(
        (source) =>
          source.id === result.outputIds?.[0] && source.status !== "disabled",
      ));
  const valid = outputReady && ingestion.valid;
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);
  const destinationPicker =
    editor && !externalEditorOutput ? (
      <FormField
        label={t("portal.policies.wizard.locations.destination", "Destination")}
        helperText={t(
          "portal.policies.wizard.locations.editorOutput",
          "Processed PDFs return to the editor workspace.",
        )}
      >
        <Input
          inputSize="sm"
          value={t(
            "portal.policies.wizard.locations.editorDestination",
            "Editor workspace",
          )}
          readOnly
        />
      </FormField>
    ) : folderName && !external && !result.outputIds?.length ? (
      <FormField
        label={t("portal.policies.wizard.locations.destination", "Destination")}
        helperText={t(
          "portal.policies.wizard.locations.folderOutput",
          "Processed files are saved in this folder. Corpus exports keep the original PDF.",
        )}
      >
        <Input inputSize="sm" value={folderName} readOnly />
      </FormField>
    ) : (
      <>
        {external &&
          outputSources.length === 0 &&
          !sources.isPending &&
          !sources.error && (
            <Banner
              tone="info"
              description={t(
                "portal.policies.wizard.locations.noDatabase",
                "No vector database destination is set up. Connect a source below, then choose or create its database connection and collection.",
              )}
            />
          )}
        {sources.error && (
          <>
            <Banner tone="danger" description={errorMessage(sources.error)} />
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => void sources.refetch()}
            >
              {t("common.retry", "Retry")}
            </Button>
          </>
        )}
        <DestinationPicker
          sources={outputSources}
          value={result.outputIds ?? []}
          onChange={(outputIds) => onChange({ outputIds })}
          onCreateNew={() => setSourceModal({})}
          onEdit={(id) => setSourceModal({ id })}
        />
        {!outputReady && (
          <p className="portal-policies__wizard-desc">
            {t(
              "portal.policies.wizard.locations.chooseOutput",
              "Choose an enabled output destination before saving.",
            )}
          </p>
        )}
        {folderName && !external && (
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => onChange({ outputIds: [] })}
          >
            {t(
              "portal.policies.wizard.locations.returnToFolder",
              "Return results to this folder",
            )}
          </Button>
        )}
      </>
    );

  const outputDestination = (
    <>
      {editor && (
        <EditorDeliverySelect
          external={externalEditorOutput}
          requiresDestination={requiresDestination}
          onChange={(external) => {
            setDestinationRequested(external);
            if (!external) onChange({ outputIds: [] });
          }}
        />
      )}
      {destinationPicker}
    </>
  );

  return (
    <section
      className="portal-policies__wizard-section"
      aria-label={t("portal.policies.wizard.locations.output", "Output")}
    >
      <h3 className="portal-policies__wizard-heading">
        {t("portal.policies.wizard.locations.output", "Output")}
      </h3>
      {ingestion.config ? (
        <PolicyIngestionConfig {...ingestion.config}>
          {outputDestination}
        </PolicyIngestionConfig>
      ) : (
        outputDestination
      )}
      {sourceModal && (
        <SourceModal
          open
          direction="output"
          sourceId={sourceModal.id}
          allowedTypes={
            external
              ? VECTOR_TYPES
              : availableOutputModes().filter((type) => type !== "vectordb")
          }
          onClose={() => setSourceModal(null)}
          onCreated={(source) => {
            if (source.id) onChange({ outputIds: [source.id] });
          }}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: ["policy-setup-source"],
            });
          }}
        />
      )}
    </section>
  );
}
