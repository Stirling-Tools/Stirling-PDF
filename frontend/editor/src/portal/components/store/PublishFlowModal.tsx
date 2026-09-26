import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Checkbox,
  FormField,
  Input,
  Select,
  Skeleton,
} from "@app/ui";
import { alert as showToast } from "@app/components/toast";
import { errorMessage } from "@portal/api/http";
import type { Policy } from "@portal/api/pipelines";
import {
  STORE_CATEGORIES,
  isStoreCategory,
  preflightPublish,
  type StoreCategory,
  type StoreListingSummary,
  type StorePreflightReport,
  type StorePublishRequest,
} from "@portal/api/store";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { usePublishPipeline } from "@portal/queries/store";
import { FlowModal } from "@portal/components/shared/FlowModal";
import { StepModalHeader } from "@portal/components/shared/StepModalHeader";
import { StoreCard } from "@portal/components/store/StoreCard";
import { StoreFindings } from "@portal/components/store/StoreFindings";
import { StoreToolIcons } from "@portal/components/store/StoreToolIcons";
import { groupFindings } from "@portal/components/store/storeTools";
import "@portal/components/store/PublishFlowModal.css";

const STEPS = ["details", "checks", "confirm"] as const;
type StepId = (typeof STEPS)[number];

const NAME_MIN = 3;
const NAME_MAX = 80;
const DESC_MIN = 20;
const DESC_MAX = 500;
const CHANGE_MAX = 300;

interface PublishFlowModalProps {
  open: boolean;
  onClose: () => void;
  /** The saved pipeline to publish. Must carry an id. */
  policy: Policy;
}

function initialCategory(policy: Policy): StoreCategory {
  const fromTemplate = policy.output?.options?.categoryId;
  return isStoreCategory(fromTemplate) ? fromTemplate : "ingestion";
}

/**
 * Three-step publish flow on the shared FlowModal: Details (what the listing says), Checks (the
 * server's preflight report, which alone decides what can be published), Confirm (the summary and
 * the rights declaration). Publishing an already-listed pipeline republishes under the same id.
 */
export function PublishFlowModal({
  open,
  onClose,
  policy,
}: PublishFlowModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const publish = usePublishPipeline();

  const [step, setStep] = useState<StepId>("details");
  const [name, setName] = useState(policy.name);
  const [category, setCategory] = useState<StoreCategory>(() =>
    initialCategory(policy),
  );
  const [description, setDescription] = useState("");
  const [whatChanged, setWhatChanged] = useState("");
  const [consent, setConsent] = useState(false);
  const [report, setReport] = useState<StorePreflightReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // A fresh open starts a fresh flow; the pipeline's current name is the natural default.
  useEffect(() => {
    if (!open) return;
    setStep("details");
    setName(policy.name);
    setCategory(initialCategory(policy));
    setDescription("");
    setWhatChanged("");
    setConsent(false);
    setReport(null);
    setCheckError(null);
    setPublishError(null);
  }, [open, policy]);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const nameValid =
    trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;
  const descriptionValid =
    trimmedDescription.length >= DESC_MIN &&
    trimmedDescription.length <= DESC_MAX;
  const detailsValid = nameValid && descriptionValid;

  const request: StorePublishRequest = useMemo(
    () => ({
      policyId: policy.id ?? "",
      name: trimmedName,
      description: trimmedDescription,
      category,
      whatChanged: whatChanged.trim() || undefined,
    }),
    [policy.id, trimmedName, trimmedDescription, category, whatChanged],
  );

  const runChecks = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      setReport(await preflightPublish(request));
    } catch (e) {
      setReport(null);
      setCheckError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }, [request]);

  // Entering Checks runs them once; a failed run waits for "Run checks again" rather than looping.
  useEffect(() => {
    if (open && step === "checks" && !report && !checking && !checkError) {
      void runChecks();
    }
  }, [open, step, report, checking, checkError, runChecks]);

  const groups = useMemo(() => groupFindings(report?.findings ?? []), [report]);
  const blockers = groups.block.length;
  const existingStoreId = report?.existingStoreId ?? null;

  const previewListing: StoreListingSummary = {
    storeId: "",
    slug: "",
    name: trimmedName || policy.name,
    description: trimmedDescription,
    category,
    icon: policy.icon ?? "",
    tools: policy.steps.map((s) => s.operation),
    starCount: 0,
    installCount: 0,
    updatedAt: new Date().toISOString(),
    curated: false,
    needsConnections: false,
    starred: null,
  };

  async function handlePublish() {
    if (!consent || !report?.canPublish) return;
    setPublishError(null);
    try {
      const listing = await publish.mutateAsync({
        body: request,
        existingStoreId,
      });
      showToast({
        title: t("portal.store.publish.published"),
        alertType: "success",
      });
      onClose();
      navigate(
        `${toPortalPath(VIEW_PATHS.store)}/${encodeURIComponent(listing.storeId)}`,
      );
    } catch (e) {
      setPublishError(errorMessage(e));
    }
  }

  const current = STEPS.indexOf(step) + 1;
  const categoryOptions = STORE_CATEGORIES.map((id) => ({
    value: id,
    label: t(`portal.store.filters.category.${id}`),
  }));

  return (
    <FlowModal
      open={open}
      onClose={onClose}
      size="lg"
      label={t("portal.store.publish.title")}
      header={
        <StepModalHeader
          title={t("portal.store.publish.title")}
          subtitle={policy.name}
          step={current}
          total={STEPS.length}
          stepLabel={t("portal.store.publish.step", {
            current,
            total: STEPS.length,
          })}
        />
      }
      footer={footer()}
    >
      <ol className="portal-store__publish-steps" aria-hidden>
        {STEPS.map((id, i) => (
          <li
            key={id}
            className={[
              "portal-store__publish-step",
              i + 1 === current ? "is-current" : "",
              i + 1 < current ? "is-done" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {t(`portal.store.publish.steps.${id}`)}
          </li>
        ))}
      </ol>
      {body()}
    </FlowModal>
  );

  function body() {
    switch (step) {
      case "details":
        return (
          <div className="portal-store__publish-details">
            <div className="portal-store__publish-form">
              <FormField
                label={t("portal.store.publish.name")}
                helperText={t("portal.store.publish.nameHelp")}
                required
              >
                <Input
                  value={name}
                  maxLength={NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormField>
              <FormField label={t("portal.store.publish.category")} required>
                <Select
                  options={categoryOptions}
                  value={category}
                  onChange={(value) => {
                    if (isStoreCategory(value)) setCategory(value);
                  }}
                />
              </FormField>
              <FormField
                label={t("portal.store.publish.description")}
                helperText={
                  <span className="portal-store__publish-counter">
                    <span>{t("portal.store.publish.descriptionHelp")}</span>
                    <span>
                      {t("portal.store.publish.counter", {
                        count: description.length,
                        max: DESC_MAX,
                      })}
                    </span>
                  </span>
                }
                required
              >
                <textarea
                  className="portal-store__textarea"
                  rows={5}
                  maxLength={DESC_MAX}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </FormField>
            </div>
            <aside className="portal-store__publish-preview">
              <span className="portal-store__publish-label">
                {t("portal.store.publish.preview")}
              </span>
              <StoreCard listing={previewListing} preview />
            </aside>
          </div>
        );
      case "checks":
        if (checking) {
          return (
            <div className="portal-store__publish-loading" aria-busy>
              <Skeleton height="3rem" />
              <Skeleton height="3rem" />
              <Skeleton height="3rem" />
            </div>
          );
        }
        return (
          <div className="portal-store__publish-checks">
            {checkError && (
              <Banner
                tone="danger"
                title={t("portal.store.publish.checksFailed")}
                description={checkError}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void runChecks()}
                  >
                    {t("portal.store.publish.runAgain")}
                  </Button>
                }
              />
            )}
            {report && blockers > 0 && (
              <Banner
                tone="danger"
                description={t("portal.store.publish.blockedBanner", {
                  count: blockers,
                })}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void runChecks()}
                  >
                    {t("portal.store.publish.runAgain")}
                  </Button>
                }
              />
            )}
            {report && <StoreFindings findings={report.findings} />}
          </div>
        );
      case "confirm":
        return (
          <div className="portal-store__publish-confirm">
            {existingStoreId && (
              <Banner
                tone="info"
                description={t("portal.store.publish.republishBanner")}
              />
            )}
            {publishError && (
              <Banner
                tone="danger"
                title={t("portal.store.publish.publishFailed")}
                description={publishError}
              />
            )}
            <dl className="portal-store__publish-summary">
              <dt>{t("portal.store.publish.summary.publishedAs")}</dt>
              <dd>
                <strong>{trimmedName}</strong>
                {", "}
                {t(`portal.store.filters.category.${category}`)}
              </dd>
              <dt>{t("portal.store.publish.summary.toolChain")}</dt>
              <dd className="portal-store__publish-chain">
                <StoreToolIcons tools={previewListing.tools} max={8} />
                <span>
                  {t("portal.store.publish.summary.steps", {
                    count: policy.steps.length,
                  })}
                </span>
              </dd>
              <dt>{t("portal.store.publish.summary.removed")}</dt>
              <dd>{summariseGroup(groups.info)}</dd>
              <dt>{t("portal.store.publish.summary.worthChecking")}</dt>
              <dd>{summariseGroup(groups.warn)}</dd>
            </dl>
            {existingStoreId && (
              <FormField
                label={t("portal.store.publish.whatChanged")}
                helperText={t("portal.store.publish.whatChangedHelp")}
              >
                <textarea
                  className="portal-store__textarea"
                  rows={3}
                  maxLength={CHANGE_MAX}
                  value={whatChanged}
                  onChange={(e) => setWhatChanged(e.target.value)}
                />
              </FormField>
            )}
            <Banner
              tone="neutral"
              title={t("portal.store.publish.whoSees.title")}
              description={t("portal.store.publish.whoSees.body")}
            />
            <Checkbox
              checked={consent}
              onChange={(e) => setConsent(e.currentTarget.checked)}
              label={t("portal.store.publish.consent")}
            />
          </div>
        );
    }
  }

  function summariseGroup(items: { title: string }[]): string {
    if (items.length === 0) return t("portal.store.publish.summary.none");
    return items.map((item) => item.title).join(", ");
  }

  function footer() {
    switch (step) {
      case "details":
        return (
          <>
            <Button variant="quiet" accent="neutral" onClick={onClose}>
              {t("portal.store.publish.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!detailsValid}
              onClick={() => {
                setReport(null);
                setCheckError(null);
                setStep("checks");
              }}
            >
              {t("portal.store.publish.continue")}
            </Button>
          </>
        );
      case "checks":
        return (
          <>
            <Button
              variant="quiet"
              accent="neutral"
              onClick={() => setStep("details")}
            >
              {t("portal.store.publish.back")}
            </Button>
            <span className="portal-store__publish-footer-right">
              {report && blockers > 0 && (
                <span className="portal-store__publish-muted">
                  {t("portal.store.publish.fixToContinue", { count: blockers })}
                </span>
              )}
              <Button
                variant="primary"
                disabled={!report?.canPublish || checking}
                onClick={() => setStep("confirm")}
              >
                {t("portal.store.publish.continue")}
              </Button>
            </span>
          </>
        );
      case "confirm":
        return (
          <>
            <Button
              variant="quiet"
              accent="neutral"
              disabled={publish.isPending}
              onClick={() => setStep("checks")}
            >
              {t("portal.store.publish.back")}
            </Button>
            <Button
              variant="primary"
              disabled={!consent || !report?.canPublish}
              loading={publish.isPending}
              onClick={() => void handlePublish()}
            >
              {existingStoreId
                ? t("portal.store.publish.republish")
                : t("portal.store.publish.publish")}
            </Button>
          </>
        );
    }
  }
}
