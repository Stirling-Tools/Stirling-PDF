import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { useRemoveListing } from "@portal/queries/store";

export interface RemovableListing {
  storeId: string;
  name: string;
  installCount: number;
}

interface RemoveListingModalProps {
  /** The listing to confirm removing; null keeps the modal closed. */
  listing: RemovableListing | null;
  onClose: () => void;
}

/** Confirms a soft removal. Shared by the team's Published tab and the listing page. */
export function RemoveListingModal({
  listing,
  onClose,
}: RemoveListingModalProps) {
  const { t } = useTranslation();
  const remove = useRemoveListing();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (listing) setError(null);
  }, [listing]);

  async function confirm() {
    if (!listing) return;
    try {
      await remove.mutateAsync(listing.storeId);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      open={listing !== null}
      onClose={() => !remove.isPending && onClose()}
      width="sm"
      title={t("portal.store.published.remove.title")}
      footer={
        <>
          <Button
            variant="tertiary"
            size="sm"
            disabled={remove.isPending}
            onClick={onClose}
          >
            {t("portal.store.published.remove.cancel")}
          </Button>
          <Button
            size="sm"
            accent="danger"
            loading={remove.isPending}
            onClick={() => void confirm()}
          >
            {t("portal.store.published.remove.confirm")}
          </Button>
        </>
      }
    >
      {error && <Banner tone="danger" description={error} />}
      <p>
        {t("portal.store.published.remove.body", {
          name: listing?.name ?? "",
          count: listing?.installCount ?? 0,
        })}
      </p>
    </Modal>
  );
}
