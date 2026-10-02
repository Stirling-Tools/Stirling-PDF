import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, FormField, Input, Modal, Select } from "@app/ui";
import { alert as showToast } from "@app/components/toast";
import { HttpError, errorMessage } from "@portal/api/http";
import {
  STORE_CATEGORIES,
  isStoreCategory,
  type StoreCategory,
  type StoreFinding,
  type StoreListingDetail,
  type StorePreflightReport,
} from "@portal/api/store";
import { useUpdateListingDetails } from "@portal/queries/store";
import { StoreFindings } from "@portal/components/store/StoreFindings";
import { STORE_TEXT_LIMITS } from "@portal/components/store/storeTools";
import "@portal/components/store/PublishFlowModal.css";

interface EditListingModalProps {
  listing: StoreListingDetail;
  onClose: () => void;
}

function blockingFindings(error: unknown): StoreFinding[] | null {
  if (!(error instanceof HttpError) || error.status !== 422) return null;
  const report = error.body as StorePreflightReport | null;
  return report?.findings?.filter((f) => f.severity === "block") ?? null;
}

/**
 * The owner's edit of a listing's words: name, category, description and the change note shown
 * as "Latest change". The tool chain is untouched; changing it means republishing. Mount it only
 * while open, so it starts from the listing as it is.
 */
export function EditListingModal({ listing, onClose }: EditListingModalProps) {
  const { t } = useTranslation();
  const update = useUpdateListingDetails();
  const [name, setName] = useState(listing.name);
  const [category, setCategory] = useState<StoreCategory>(
    isStoreCategory(listing.category) ? listing.category : "ingestion",
  );
  const [description, setDescription] = useState(listing.description);
  const [whatChanged, setWhatChanged] = useState(listing.latestChange ?? "");
  const [blocks, setBlocks] = useState<StoreFinding[]>([]);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const valid =
    trimmedName.length >= STORE_TEXT_LIMITS.nameMin &&
    trimmedName.length <= STORE_TEXT_LIMITS.nameMax &&
    trimmedDescription.length >= STORE_TEXT_LIMITS.descriptionMin &&
    trimmedDescription.length <= STORE_TEXT_LIMITS.descriptionMax;

  async function save() {
    setBlocks([]);
    setError(null);
    try {
      await update.mutateAsync({
        storeId: listing.storeId,
        body: {
          name: trimmedName,
          description: trimmedDescription,
          category,
          whatChanged: whatChanged.trim() || undefined,
        },
      });
      showToast({ title: t("portal.store.edit.saved"), alertType: "success" });
      onClose();
    } catch (e) {
      const findings = blockingFindings(e);
      if (findings?.length) setBlocks(findings);
      else setError(errorMessage(e));
    }
  }

  return (
    <Modal
      open
      onClose={() => !update.isPending && onClose()}
      width="md"
      title={t("portal.store.edit.title")}
      footer={
        <>
          <Button
            variant="quiet"
            accent="neutral"
            disabled={update.isPending}
            onClick={onClose}
          >
            {t("portal.store.publish.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={update.isPending}
            onClick={() => void save()}
          >
            {t("portal.store.edit.save")}
          </Button>
        </>
      }
    >
      <div className="portal-store__publish-form">
        {error && (
          <Banner
            tone="danger"
            title={t("portal.store.edit.failed")}
            description={error}
          />
        )}
        {blocks.length > 0 && <StoreFindings findings={blocks} />}
        <FormField
          label={t("portal.store.publish.name")}
          info={t("portal.store.publish.nameHelp")}
          required
        >
          <Input
            value={name}
            maxLength={STORE_TEXT_LIMITS.nameMax}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label={t("portal.store.publish.category")} required>
          <Select
            options={STORE_CATEGORIES.map((id) => ({
              value: id,
              label: t(`portal.store.filters.category.${id}`),
            }))}
            value={category}
            onChange={(value) => {
              if (isStoreCategory(value)) setCategory(value);
            }}
          />
        </FormField>
        <FormField
          label={t("portal.store.publish.description")}
          info={t("portal.store.publish.descriptionHelp")}
          helperText={t("portal.store.publish.counter", {
            count: description.length,
            max: STORE_TEXT_LIMITS.descriptionMax,
          })}
          required
        >
          <textarea
            className="portal-store__textarea"
            rows={5}
            maxLength={STORE_TEXT_LIMITS.descriptionMax}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField
          label={t("portal.store.publish.whatChanged")}
          info={t("portal.store.publish.whatChangedHelp")}
        >
          <textarea
            className="portal-store__textarea"
            rows={3}
            maxLength={STORE_TEXT_LIMITS.whatChangedMax}
            value={whatChanged}
            onChange={(e) => setWhatChanged(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
