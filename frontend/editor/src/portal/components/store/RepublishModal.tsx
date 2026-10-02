import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Banner, Modal, Skeleton } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { fetchPipeline } from "@portal/api/pipelines";
import { qk } from "@portal/queries/keys";
import { PublishFlowModal } from "@portal/components/store/PublishFlowModal";

interface RepublishModalProps {
  /** The pipeline on this instance that publishes the listing; null keeps the modal closed. */
  pipelineId: string | null;
  onClose: () => void;
}

/**
 * Republish from wherever the listing is managed, not only from the builder: loads the source
 * pipeline and opens the same publish flow on it, which the backend treats as a republish because
 * the pipeline carries the listing's id.
 */
export function RepublishModal({ pipelineId, onClose }: RepublishModalProps) {
  const { t } = useTranslation();
  const policy = useQuery({
    queryKey: [...qk.pipelines(), "policy", pipelineId ?? ""],
    queryFn: () => fetchPipeline(pipelineId as string),
    enabled: Boolean(pipelineId),
  });

  if (!pipelineId) return null;
  if (policy.data) {
    return <PublishFlowModal open onClose={onClose} policy={policy.data} />;
  }
  return (
    <Modal
      open
      onClose={onClose}
      width="sm"
      title={t("portal.store.publish.republishTitle")}
    >
      {policy.isError ? (
        <Banner tone="danger" description={errorMessage(policy.error)} />
      ) : (
        <Skeleton height="3rem" />
      )}
    </Modal>
  );
}
