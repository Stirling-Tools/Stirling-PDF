import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import {
  ActionIcon,
  Banner,
  Button,
  Card,
  Dropdown,
  EmptyState,
  MetricCard,
  Skeleton,
} from "@app/ui";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import { formatRelativeTime } from "@app/utils/timeUtils";
import { errorMessage } from "@portal/api/http";
import { isSaasBuild } from "@portal/api/saasApiBase";
import { fetchStoreManifest } from "@portal/api/store";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { StoreIcon } from "@portal/components/icons";
import { pipelineIcon } from "@portal/components/pipelines/pipelineIcon";
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
import { useStoreListing } from "@portal/queries/store";
import "@portal/views/StoreListing.css";

/**
 * One listing, read-only: what the chain does, what each step carries, what the installer still
 * supplies, and the Install button that copies it here (no picker, no modal; see D9 and D11).
 */
export function StoreListing() {
  const { t } = useTranslation();
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { allTools } = useToolRegistry();
  const listing = useStoreListing(storeId);
  const { install, installingId, error: installError } = useInstallPipeline();
  const { copied: linkCopied, copy: copyLink } = useCopyToClipboard();
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const saas = isSaasBuild();
  const storePath = toPortalPath(VIEW_PATHS.store);

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
          icon={<StoreIcon size={28} />}
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
  const updated = formatRelativeTime(new Date(data.updatedAt).getTime(), t);
  const firstPublished = formatRelativeTime(
    new Date(data.firstPublishedAt).getTime(),
    t,
  );
  const author = data.viewer?.author;
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
          <div className="portal-store-listing__titles">
            <div className="portal-store-listing__title-row">
              <h1 className="portal-store-listing__title">{data.name}</h1>
              <StoreIdBadge id={data.storeId} copyable />
            </div>
            <p className="portal-store-listing__meta">
              {t("portal.store.detail.meta", {
                category: t(`portal.store.filters.category.${data.category}`, {
                  defaultValue: data.category,
                }),
                updated,
                firstPublished,
              })}
            </p>
          </div>
        </div>

        <div className="portal-store-listing__actions">
          <StoreStarButton
            storeId={data.storeId}
            starred={data.viewer?.starred ?? data.starred}
            starCount={data.starCount}
            withLabel
          />
          <div className="portal-store-listing__install">
            <Button
              variant="primary"
              loading={installing}
              onClick={() => install(data.storeId)}
            >
              {t(installTargetLabelKey(saas))}
            </Button>
            <span className="portal-store-listing__install-caption">
              {t(installTargetCaptionKey(saas))}
            </span>
          </div>
          <Dropdown.Root align="end">
            <Dropdown.Trigger>
              <ActionIcon
                variant="tertiary"
                aria-label={t("portal.store.detail.moreActions")}
              >
                <MoreHorizRoundedIcon style={{ fontSize: "1.125rem" }} />
              </ActionIcon>
            </Dropdown.Trigger>
            <Dropdown.Menu>
              <Dropdown.Item
                onSelect={() => void handleDownload()}
                leading={
                  <DownloadRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
              >
                {t("portal.store.detail.downloadJson")}
              </Dropdown.Item>
              <Dropdown.Item
                onSelect={() => void copyLink(shareUrl)}
                leading={<LinkRoundedIcon style={{ fontSize: "1.125rem" }} />}
              >
                {t("portal.store.detail.copyLink")}
              </Dropdown.Item>
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
          label={t("portal.store.detail.metrics.updated")}
          value={updated}
        />
        <MetricCard
          size="sm"
          label={t("portal.store.detail.metrics.tools")}
          value={data.steps.length}
        />
        <MetricCard
          size="sm"
          label={t("portal.store.detail.metrics.author")}
          value={
            author
              ? t("portal.store.detail.authorTeam", {
                  name: author.displayName,
                })
              : t("portal.store.detail.authorHiddenShort")
          }
          description={
            author ? undefined : t("portal.store.detail.authorHidden")
          }
        />
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
              {t("portal.store.detail.notIncluded.title")}
            </h2>
            <ul className="portal-store-listing__list">
              <li>{t("portal.store.detail.notIncluded.source")}</li>
              <li>{t("portal.store.detail.notIncluded.destination")}</li>
              <li>{t("portal.store.detail.notIncluded.secrets")}</li>
              <li>{t("portal.store.detail.notIncluded.schedule")}</li>
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

      <Card padding="default">
        <h2 className="portal-store-listing__section-title">
          {t("portal.store.detail.latestChange.title")}
        </h2>
        <p className="portal-store-listing__change">
          {data.latestChange ?? t("portal.store.detail.latestChange.none")}
        </p>
        <p className="portal-store-listing__muted">
          {t("portal.store.detail.latestChange.hint")}
        </p>
      </Card>

      <footer className="portal-store-listing__share">
        <span className="portal-store-listing__share-label">
          {t("portal.store.detail.shareLabel")}
        </span>
        <code className="portal-store-listing__share-url">
          {shareUrl.replace(/^https:\/\//, "")}
        </code>
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => void copyLink(shareUrl)}
          leftSection={
            linkCopied ? (
              <CheckRoundedIcon style={{ fontSize: "1rem" }} />
            ) : (
              <ContentCopyRoundedIcon style={{ fontSize: "1rem" }} />
            )
          }
        >
          {linkCopied
            ? t("portal.store.card.copied")
            : t("portal.store.detail.copyLink")}
        </Button>
      </footer>
    </div>
  );
}
