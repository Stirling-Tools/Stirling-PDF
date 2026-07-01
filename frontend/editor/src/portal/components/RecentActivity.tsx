import { useTranslation } from "react-i18next";
import { Card, EmptyState, Skeleton, StatusBadge } from "@shared/components";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchRecentActivity,
  type ActivityEvent,
  type ActivityKind,
} from "@portal/api/home";
import "@portal/components/RecentActivity.css";

const KIND_COLOUR: Record<ActivityKind, string> = {
  "pipeline-run": "var(--color-blue)",
  deploy: "var(--color-green)",
  drift: "var(--color-amber)",
  eval: "var(--color-purple)",
  agent: "var(--color-cat-insurance)",
  billing: "var(--color-red)",
};

export function RecentActivity() {
  const { t } = useTranslation();
  const state = useAsync<ActivityEvent[]>(() => fetchRecentActivity(), []);
  const { data: events } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  return (
    <Card
      padding="none"
      className="portal-activity"
      aria-label={t("recentActivity.title")}
    >
      <header className="portal-activity__head">
        <h2 className="portal-activity__title">{t("recentActivity.title")}</h2>
        <button type="button" className="portal-activity__more">
          {t("recentActivity.viewAll")} →
        </button>
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
          title={t("recentActivity.empty.title")}
          description={t("recentActivity.empty.description")}
        />
      )}

      {events && events.length > 0 && (
        <ol className="portal-activity__list">
          {events.map((event) => (
            <li key={event.id} className="portal-activity__item">
              <span
                className="portal-activity__rail"
                style={{ background: KIND_COLOUR[event.kind] }}
                aria-hidden
              />
              <div className="portal-activity__body">
                <div className="portal-activity__row">
                  <span className="portal-activity__action">
                    {event.action}
                  </span>
                  <span className="portal-activity__time">{event.time}</span>
                </div>
                <div className="portal-activity__subject">{event.subject}</div>
                <div className="portal-activity__detail-row">
                  <span className="portal-activity__detail">
                    {event.detail}
                  </span>
                  <StatusBadge tone={event.status} size="sm">
                    {event.status}
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
