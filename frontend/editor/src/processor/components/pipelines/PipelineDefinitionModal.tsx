import { useTranslation } from "react-i18next";
import { CodeBlock, Modal } from "@app/ui";
import "@processor/components/pipelines/PipelineDefinitionModal.css";

export interface PipelineDefinitionModalProps {
  open: boolean;
  onClose: () => void;
  /** The pipeline as it would be saved, pretty-printed. Re-read while the modal is open. */
  json: string;
}

/**
 * The pipeline's definition as it would be saved.
 *
 * Pipeline-scoped, so it opens from the header rather than the node inspector, and a modal rather
 * than a panel because a definition grows with the chain and needs the width.
 */
export function PipelineDefinitionModal({
  open,
  onClose,
  json,
}: PipelineDefinitionModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={t("processor.pipelines.definition.title")}
      subtitle={t("processor.pipelines.definition.subtitle")}
      className="processor-definition__modal"
    >
      <CodeBlock
        code={json}
        lang="json"
        maxHeight={420}
        className="processor-definition__code"
      />
    </Modal>
  );
}
