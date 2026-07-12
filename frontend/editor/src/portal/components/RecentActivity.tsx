import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  fetchAuditLog,
  type AuditLogResponse,
  type AuditStatus,
} from "@portal/api/infrastructure";
import {
  AUDIT_CAT_LABEL,
  AUDIT_STATUS_LABEL,
  AUDIT_TONE,
} from "@portal/components/infrastructure/infraFormat";
import "@portal/components/RecentActivity.css";

/** Rail colour by outcome — mirrors the audit status tones. */
const STATUS_COLOUR: Record<AuditStatus, string> = {
  success: "var(--color-green)",
  warning: "var(--color-amber)",
  danger: "var(--color-red)",
  info: "var(--c-primary)",
};

/** How many of the most recent audit events the home card shows. */
const MAX_EVENTS = 6;

/**
 * The home "Recent activity" card, backed by the real audit log (the same
 * endpoint the Infrastructure → Audit tab reads). Shows the latest few events;
 * "View all" jumps to the full audit view. Failures and an empty log both fall
 * through to the empty state — never an error banner on the dashboard.
 */
export function RecentActivity() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { setActiveView } = useView();
  const { data, loading } = useAsync<AuditLogResponse>(
    () => fetchAuditLog(tier),
    [tier],
  );

  const events = data?.events.slice(0, MAX_EVENTS) ?? [];
  const isLoading = loading && data === null;
  const isEmpty = !isLoading && events.length === 0;

  return (
    <Card
      padding="none"
      className="portal-activity"
      aria-label={t("portal.recentActivity.title")}
    >
      <header className="portal-activity__head">
        <h2 className="portal-activity__title">
          {t("portal.recentActivity.title")}
        </h2>
        <Button
          variant="quiet"
          type="button"
          className="portal-activity__more"
          onClick={() => setActiveView("infrastructure")}
        >
          {t("portal.recentActivity.viewAll")} →
        </Button>
      </header>

      {isLoading && (
        <ul className="portal-activity__list" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className="portal-activity__item portal-activity__item--skeleton"
            >
              <span className="portal-activity__rail" />
              <div className="portal-activity__body">
                <Skeleton width="70%" />
                <Skeleton width="50%" height="0.625rem" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {isEmpty && (
        <EmptyState
          size="compact"
          title={t("portal.recentActivity.empty.title")}
          description={t("portal.recentActivity.empty.description")}
        />
      )}

      {events.length > 0 && (
        <ol className="portal-activity__list">
          {events.map((event) => (
            <li key={event.id} className="portal-activity__item">
              <span
                className="portal-activity__rail"
                style={{ background: STATUS_COLOUR[event.status] }}
                aria-hidden
              />
              <div className="portal-activity__body">
                <div className="portal-activity__row">
                  <span className="portal-activity__action">
                    {event.action}
                  </span>
                  <span className="portal-activity__time">
                    {event.timestamp}
                  </span>
                </div>
                <div className="portal-activity__subject">{event.target}</div>
                <div className="portal-activity__detail-row">
                  <span className="portal-activity__detail">
                    {t(AUDIT_CAT_LABEL[event.category])} · {event.actor}
                  </span>
                  <StatusBadge tone={AUDIT_TONE[event.status]} size="sm">
                    {t(AUDIT_STATUS_LABEL[event.status])}
                  </StatusBadge>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
