import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Banner,
  Button,
  Card,
  Chip,
  Dropdown,
  EmptyState,
  MetricCard,
  Skeleton,
  Tooltip,
} from "@app/ui";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { formatRelativeTime } from "@app/utils/timeUtils";
import { errorMessage } from "@portal/api/http";
import { isSaasBuild } from "@portal/api/saasApiBase";
import { fetchStoreManifest } from "@portal/api/store";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { Icon } from "@app/ui/Icon";
import { InfoHint } from "@portal/components/InfoHint";
import { pipelineIcon } from "@portal/components/pipelines/pipelineIcon";
import { EditListingModal } from "@portal/components/store/EditListingModal";
import { RemoveListingModal } from "@portal/components/store/RemoveListingModal";
import { RepublishModal } from "@portal/components/store/RepublishModal";
import {
  StoreIdBadge,
  useCopyToClipboard,
} from "@portal/components/store/StoreIdBadge";
import { StoreReadOnlyGraph } from "@portal/components/store/StoreReadOnlyGraph";
import { StoreStarButton } from "@portal/components/store/StoreStarButton";
import { useInstallPipeline } from "@portal/components/store/useInstallPipeline";
import {
  downloadManifest,
  formatCount,
  formatParamValue,
  installTargetCaptionKey,
  installTargetLabelKey,
  operationLabel,
  requiredFieldsForStep,
  storeShareUrl,
} from "@portal/components/store/storeTools";
import { usePipelines } from "@portal/queries/pipelines";
import { useStoreListing } from "@portal/queries/store";
import {
  signInToContinue,
  useStoreAccess,
} from "@portal/components/store/storeAccess";
import "@portal/views/StoreListing.css";

/**
 * One listing, read-only for everyone but its publisher: what the chain does, what each step
 * carries, what the installer sets up, and the Install button that copies it here with no picker
 * and no modal. The publisher's team also gets the listing's management (edit the words,
 * republish from the source pipeline, remove), so the page they land on after publishing is the
 * one they manage it from.
 */
export function StoreListing() {
  const { t } = useTranslation();
  const { storeId } = useParams<{ storeId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { allTools } = useToolRegistry();
  const listing = useStoreListing(storeId);
  const access = useStoreAccess();
  const { install, installingId, error: installError } = useInstallPipeline();
  const { copied: linkCopied, copy: copyLink } = useCopyToClipboard();
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [republishId, setRepublishId] = useState<string | null>(null);

  const saas = isSaasBuild();
  const storePath = toPortalPath(VIEW_PATHS.store);
  const pipelinesPath = toPortalPath(VIEW_PATHS.pipelines);
  // Managing a listing happens in the portal; outside it a teammate reads it like anyone else.
  const isOwner =
    access === "member" && listing.data?.viewer?.isTeammate === true;
  const pipelines = usePipelines({ enabled: isOwner });

  // The Published tab's "Edit listing" lands here with ?edit=1.
  useEffect(() => {
    if (searchParams.get("edit") !== "1" || !listing.data) return;
    if (isOwner && listing.data.removedBy !== "STAFF") setEditing(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, listing.data, isOwner]);

  async function handleDownload() {
    if (!storeId) return;
    setDownloadError(null);
    try {
      downloadManifest(await fetchStoreManifest(storeId), storeId);
    } catch (e) {
      setDownloadError(errorMessage(e));
    }
  }

  if (listing.isPending) {
    return (
      <div className="portal-store-listing" aria-busy>
        <Skeleton height="1rem" width="12rem" />
        <Skeleton height="3rem" />
        <div className="portal-store-listing__metrics">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="5rem" shape="rect" />
          ))}
        </div>
        <Skeleton height="20rem" shape="rect" />
      </div>
    );
  }

  if (listing.isError || !listing.data || !storeId) {
    return (
      <div className="portal-store-listing">
        <EmptyState
          icon={<Icon name="store" size={28} />}
          title={t("portal.store.detail.notFound")}
          description={listing.error ? errorMessage(listing.error) : undefined}
          actions={
            <Button variant="secondary" onClick={() => navigate(storePath)}>
              {t("portal.store.detail.breadcrumb")}
            </Button>
          }
        />
      </div>
    );
  }

  const data = listing.data;
  const removed = data.status === "REMOVED";
  // A takedown by Stirling is final for the team: no edit, republish or remove.
  const canManage = isOwner && data.removedBy !== "STAFF";
  const updated = formatRelativeTime(new Date(data.updatedAt).getTime(), t);
  const firstPublished = formatRelativeTime(
    new Date(data.firstPublishedAt).getTime(),
    t,
  );
  const author = data.viewer?.author;
  // The team's pipeline that publishes this listing, which Republish runs the flow on.
  const sourcePipelineId = isOwner
    ? pipelines.data?.pipelines.find((p) => p.storeId === data.storeId)?.id
    : undefined;
  const step = selectedStep !== null ? data.steps[selectedStep] : undefined;
  const hiddenFields =
    selectedStep !== null
      ? requiredFieldsForStep(data.requiredOnInstall, selectedStep)
      : new Set<string>();
  const shareUrl = storeShareUrl(data.storeId);
  const installing = installingId === data.storeId;

  return (
    <div className="portal-store-listing">
      <nav className="portal-store-listing__crumbs" aria-label="Breadcrumb">
        <Link to={storePath}>{t("portal.store.detail.breadcrumb")}</Link>
        <span aria-hidden>/</span>
        <span>{data.name}</span>
      </nav>

      <header className="portal-store-listing__head">
        <div className="portal-store-listing__identity">
          <span className="portal-store-listing__icon" aria-hidden>
            {pipelineIcon(data.icon, "1.5rem")}
          </span>
          <div className="portal-store-listing__title-row">
            <h1 className="portal-store-listing__title">{data.name}</h1>
            <StoreIdBadge id={data.storeId} copyable />
            <Chip size="xs" accent="neutral" showDot={false}>
              {t(`portal.store.filters.category.${data.category}`, {
                defaultValue: data.category,
              })}
            </Chip>
            {isOwner && (
              <Chip
                size="xs"
                accent="default"
                showDot={false}
                leadingIcon={<Icon name="users" size="0.875rem" />}
              >
                {t("portal.store.detail.yourListing")}
              </Chip>
            )}
            {removed && (
              <Chip size="xs" accent="warning" showDot={false}>
                {data.removedBy === "STAFF"
                  ? t("portal.store.detail.removedByStaff")
                  : t("portal.store.published.status.REMOVED")}
              </Chip>
            )}
          </div>
        </div>

        <div className="portal-store-listing__actions">
          {!removed && (
            <StoreStarButton
              storeId={data.storeId}
              starred={data.viewer?.starred ?? data.starred}
              starCount={data.starCount}
              withLabel
            />
          )}
          {canManage && (
            <Button
              variant="secondary"
              leftSection={<Icon name="pencil" size="1rem" />}
              onClick={() => setEditing(true)}
            >
              {t("portal.store.detail.edit")}
            </Button>
          )}
          {removed ? (
            canManage && (
              <Button
                variant="primary"
                disabled={!sourcePipelineId}
                onClick={() =>
                  sourcePipelineId && setRepublishId(sourcePipelineId)
                }
              >
                {t("portal.store.publish.republish")}
              </Button>
            )
          ) : access === "guest" ? (
            <Tooltip content={t(installTargetCaptionKey(saas))}>
              <Button variant="primary" onClick={signInToContinue}>
                {t("portal.store.guest.signInToInstall")}
              </Button>
            </Tooltip>
          ) : access === "signedIn" ? (
            <span className="portal-store-listing__install-blocked">
              <Button variant="primary" disabled>
                {t(installTargetLabelKey(saas))}
              </Button>
              <InfoHint
                content={t("portal.store.guest.installNeedsAccess")}
                label={t("portal.store.guest.installNeedsAccessLabel")}
              />
            </span>
          ) : (
            <Tooltip content={t(installTargetCaptionKey(saas))}>
              <Button
                variant="primary"
                loading={installing}
                onClick={() => install(data.storeId)}
              >
                {t(installTargetLabelKey(saas))}
              </Button>
            </Tooltip>
          )}
          <Dropdown.Root align="end">
            <Dropdown.Trigger>
              <ActionIcon
                variant="tertiary"
                aria-label={t("portal.store.detail.moreActions")}
              >
                <Icon name="ellipsis" size="1.125rem" />
              </ActionIcon>
            </Dropdown.Trigger>
            <Dropdown.Menu>
              {!removed && (
                <Dropdown.Item
                  onSelect={() => void handleDownload()}
                  leading={<Icon name="download" size="1rem" />}
                >
                  {t("portal.store.detail.downloadJson")}
                </Dropdown.Item>
              )}
              <Dropdown.Item
                onSelect={() => void copyLink(shareUrl)}
                leading={<Icon name="link" size="1rem" />}
              >
                {t("portal.store.detail.copyLink")}
              </Dropdown.Item>
              {canManage && !removed && (
                <Dropdown.Item
                  disabled={!sourcePipelineId}
                  onSelect={() =>
                    sourcePipelineId && setRepublishId(sourcePipelineId)
                  }
                  leading={<Icon name="refresh-cw" size="1rem" />}
                >
                  {t("portal.store.publish.republish")}
                </Dropdown.Item>
              )}
              {isOwner && sourcePipelineId && (
                <Dropdown.Item
                  onSelect={() =>
                    navigate(
                      `${pipelinesPath}/${encodeURIComponent(sourcePipelineId)}`,
                    )
                  }
                  leading={<Icon name="workflow" size="1rem" />}
                >
                  {t("portal.store.detail.openPipeline")}
                </Dropdown.Item>
              )}
              {canManage && !removed && (
                <Dropdown.Item
                  onSelect={() => setRemoving(true)}
                  leading={<Icon name="trash" size="1rem" />}
                >
                  {t("portal.store.published.actions.remove")}
                </Dropdown.Item>
              )}
            </Dropdown.Menu>
          </Dropdown.Root>
        </div>
      </header>

      {installError && (
        <Banner
          tone="danger"
          title={t("portal.store.detail.installFailed")}
          description={installError}
        />
      )}
      {downloadError && <Banner tone="danger" description={downloadError} />}

      <p className="portal-store-listing__description">{data.description}</p>

      <div className="portal-store-listing__metrics">
        <MetricCard
          size="sm"
          label={t("portal.store.detail.metrics.installs")}
          value={formatCount(data.installCount)}
        />
        <MetricCard
          size="sm"
          label={t("portal.store.detail.metrics.stars")}
          value={formatCount(data.starCount)}
        />
        <MetricCard
          size="sm"
          className="portal-store-listing__metric-text"
          label={t("portal.store.detail.metrics.updated")}
          value={updated}
        />
        <MetricCard
          size="sm"
          className="portal-store-listing__metric-text"
          label={t("portal.store.detail.metrics.firstPublished")}
          value={firstPublished}
        />
        <MetricCard
          size="sm"
          label={t("portal.store.detail.metrics.tools")}
          value={data.steps.length}
        />
        {author && (
          <MetricCard
            size="sm"
            className="portal-store-listing__metric-text"
            label={t("portal.store.detail.metrics.author")}
            value={author.displayName}
          />
        )}
      </div>

      <div className="portal-store-listing__columns">
        <Card className="portal-store-listing__graph-card" padding="loose">
          <h2 className="portal-store-listing__section-title">
            {t("portal.store.detail.graphTitle")}
          </h2>
          <StoreReadOnlyGraph
            steps={data.steps}
            requiredOnInstall={data.requiredOnInstall}
            selectedIndex={selectedStep}
            onSelect={(index) =>
              setSelectedStep((current) => (current === index ? null : index))
            }
          />
        </Card>

        <div className="portal-store-listing__side">
          <Card padding="default">
            <h2 className="portal-store-listing__section-title">
              {step
                ? operationLabel(step.operation, allTools, t)
                : t("portal.store.detail.inspectorTitle")}
            </h2>
            {!step && (
              <p className="portal-store-listing__muted">
                {t("portal.store.detail.inspectorEmpty")}
              </p>
            )}
            {step && Object.keys(step.parameters).length === 0 && (
              <p className="portal-store-listing__muted">
                {t("portal.store.detail.noSettings")}
              </p>
            )}
            {step && Object.keys(step.parameters).length > 0 && (
              <dl className="portal-store-listing__params">
                {Object.entries(step.parameters).map(([key, value]) => (
                  <div key={key} className="portal-store-listing__param">
                    <dt>{key}</dt>
                    <dd>
                      {hiddenFields.has(key) ? (
                        <em>{t("portal.store.detail.setOnInstall")}</em>
                      ) : (
                        formatParamValue(value)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card padding="default">
            <h2 className="portal-store-listing__section-title">
              {t("portal.store.detail.customise.title")}
            </h2>
            <ul className="portal-store-listing__checklist">
              <li>
                <Icon name="check" size="0.875rem" />
                {t("portal.store.detail.customise.source")}
              </li>
              <li>
                <Icon name="check" size="0.875rem" />
                {t("portal.store.detail.customise.destination")}
              </li>
              <li>
                <Icon name="check" size="0.875rem" />
                {t("portal.store.detail.customise.secrets")}
              </li>
              <li>
                <Icon name="check" size="0.875rem" />
                {t("portal.store.detail.customise.schedule")}
              </li>
            </ul>
          </Card>

          <Card padding="default">
            <h2 className="portal-store-listing__section-title">
              {t("portal.store.detail.compatibility.title")}
            </h2>
            <p className="portal-store-listing__muted">
              {data.minimumStirlingVersion
                ? t("portal.store.detail.compatibility.minimum", {
                    version: data.minimumStirlingVersion,
                  })
                : t("portal.store.detail.compatibility.any")}
            </p>
          </Card>
        </div>
      </div>

      {(data.latestChange || canManage) && (
        <Card padding="default">
          <div className="portal-store-listing__section-head">
            <h2 className="portal-store-listing__section-title">
              {t("portal.store.detail.latestChange.title")}
            </h2>
            <InfoHint
              content={t("portal.store.detail.latestChange.hint")}
              label={t("portal.store.detail.latestChange.hintLabel")}
            />
            {canManage && (
              <Button
                className="portal-store-listing__section-action"
                variant="tertiary"
                size="sm"
                onClick={() => setEditing(true)}
              >
                {data.latestChange
                  ? t("portal.store.detail.latestChange.edit")
                  : t("portal.store.detail.latestChange.add")}
              </Button>
            )}
          </div>
          <p
            className={
              data.latestChange
                ? "portal-store-listing__change"
                : "portal-store-listing__muted"
            }
          >
            {data.latestChange ?? t("portal.store.detail.latestChange.none")}
          </p>
        </Card>
      )}

      <footer className="portal-store-listing__share">
        <span className="portal-store-listing__share-label">
          {t("portal.store.detail.shareLabel")}
        </span>
        <code className="portal-store-listing__share-url">
          {shareUrl.replace(/^https?:\/\//, "")}
        </code>
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => void copyLink(shareUrl)}
          leftSection={
            <Icon name={linkCopied ? "check" : "copy"} size="1rem" />
          }
        >
          {linkCopied
            ? t("portal.store.card.copied")
            : t("portal.store.detail.copyLink")}
        </Button>
      </footer>

      {editing && (
        <EditListingModal listing={data} onClose={() => setEditing(false)} />
      )}
      <RemoveListingModal
        listing={removing ? data : null}
        onClose={() => setRemoving(false)}
      />
      <RepublishModal
        pipelineId={republishId}
        onClose={() => setRepublishId(null)}
      />
    </div>
  );
}
