import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card, Chip } from "@app/ui";
import { formatRelativeTime } from "@app/utils/timeUtils";
import type { StoreListingSummary } from "@portal/api/store";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { pipelineIcon } from "@portal/components/pipelines/pipelineIcon";
import { StoreIdBadge } from "@portal/components/store/StoreIdBadge";
import { StoreStarButton } from "@portal/components/store/StoreStarButton";
import { StoreToolIcons } from "@portal/components/store/StoreToolIcons";
import { formatCount } from "@portal/components/store/storeTools";
import { isBuiltInStoreId } from "@portal/components/store/builtInIds";
import "@portal/components/store/StoreCard.css";

interface StoreCardProps {
  listing: StoreListingSummary;
  /** The publish flow's live preview: no id yet, nothing to star, nowhere to go. */
  preview?: boolean;
}

/** One listing in the browse grid (and the publish flow's preview of what a listing will look like). */
export function StoreCard({ listing, preview = false }: StoreCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const detailPath = `${toPortalPath(VIEW_PATHS.store)}/${encodeURIComponent(listing.storeId)}`;
  // A Stirling template has no store row, so nothing to star and no counts to show.
  const builtIn = isBuiltInStoreId(listing.storeId);
  const updated = preview
    ? t("time.relative.justNow")
    : builtIn
      ? ""
      : formatRelativeTime(new Date(listing.updatedAt).getTime(), t);

  return (
    <Card className="portal-store__card" padding="default">
      <div className="portal-store__card-head">
        <span className="portal-store__card-icon" aria-hidden>
          {pipelineIcon(listing.icon, "1.125rem")}
        </span>
        <h2 className="portal-store__card-name" title={listing.name}>
          {listing.name}
        </h2>
        {!builtIn && (
          <StoreStarButton
            storeId={listing.storeId}
            starred={listing.starred}
            starCount={listing.starCount}
            disabled={preview}
          />
        )}
      </div>

      <div className="portal-store__card-badges">
        <StoreIdBadge
          id={preview ? t("portal.store.card.idPending") : listing.storeId}
        />
        <Chip size="xs" accent="neutral" showDot={false}>
          {t(`portal.store.filters.category.${listing.category}`, {
            defaultValue: listing.category,
          })}
        </Chip>
        {listing.curated && (
          <Chip size="xs" accent="brand" showDot={false}>
            {t("portal.store.card.byStirling")}
          </Chip>
        )}
      </div>

      <p className="portal-store__card-desc">{listing.description}</p>

      <StoreToolIcons tools={listing.tools} />

      <div className="portal-store__card-foot">
        <span className="portal-store__card-meta">
          {builtIn ? (
            t("portal.store.card.steps", { count: listing.tools.length })
          ) : (
            <>
              {t("portal.store.card.installs", {
                count: listing.installCount,
                formatted: formatCount(listing.installCount),
              })}
              {", "}
              {t("portal.store.card.updated", { when: updated })}
            </>
          )}
        </span>
        {preview ? (
          <Button variant="secondary" size="sm" disabled>
            {t("portal.store.card.view")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(detailPath)}
          >
            {t("portal.store.card.view")}
          </Button>
        )}
      </div>
    </Card>
  );
}
