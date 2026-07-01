import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown, EmptyState, Skeleton } from "@shared/components";
import { BellIcon } from "@portal/components/icons";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchNotifications,
  markAllNotificationsRead,
  type Notification,
  type NotificationCategory,
} from "@portal/api/notifications";
import "@portal/components/NotificationsDropdown.css";

const CATEGORY_COLOUR: Record<NotificationCategory, string> = {
  pipeline: "var(--color-blue)",
  deploy: "var(--color-green)",
  billing: "var(--color-amber)",
  audit: "var(--color-purple)",
  agent: "var(--color-cat-insurance)",
  doc: "var(--color-cat-healthcare)",
};

export function NotificationsDropdown() {
  const { t } = useTranslation();
  const state = useAsync<Notification[]>(() => fetchNotifications(), []);
  const { data: items } = state;
  const { isLoading } = useSectionFlags(state);

  // Optimistically clear on "mark all read"; revert if the request fails.
  const [cleared, setCleared] = useState(false);
  const visible = cleared ? [] : (items ?? []);

  async function onMarkAllRead() {
    setCleared(true);
    try {
      await markAllNotificationsRead();
    } catch {
      setCleared(false);
    }
  }

  const isEmpty = !isLoading && visible.length === 0;
  const hasUnread = visible.length > 0;

  return (
    <Dropdown.Root align="end">
      <Dropdown.Trigger>
        <button
          type="button"
          className="portal-header__icon-btn portal-header__icon-btn--badge"
          aria-label={
            hasUnread
              ? t("notifications.ariaLabel.unread", {
                  count: visible.length,
                })
              : t("notifications.ariaLabel.none")
          }
        >
          <BellIcon size={16} />
          {hasUnread && (
            <span className="portal-header__bell-dot" aria-hidden />
          )}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Menu width="22.5rem" className="portal-notif__menu">
        <div className="portal-notif__header">
          <span className="portal-notif__title">
            {t("notifications.title")}
          </span>
          {hasUnread ? (
            <span className="portal-notif__count">
              {t("notifications.count.new", { count: visible.length })}
            </span>
          ) : isLoading ? (
            <span className="portal-notif__count portal-notif__count--quiet">
              {t("notifications.count.loading")}
            </span>
          ) : (
            <span className="portal-notif__count portal-notif__count--quiet">
              {t("notifications.count.allRead")}
            </span>
          )}
        </div>
        {isLoading && (
          <div className="portal-notif__loading">
            <Skeleton height="0.875rem" />
            <Skeleton height="0.6875rem" width="60%" />
            <Skeleton height="0.875rem" />
            <Skeleton height="0.6875rem" width="60%" />
          </div>
        )}
        {isEmpty && (
          <EmptyState
            size="compact"
            title={t("notifications.empty.title")}
            description={t("notifications.empty.description")}
          />
        )}
        {!isLoading && !isEmpty && (
          <ul className="portal-notif__list">
            {visible.map((item) => (
              <li key={item.id} className="portal-notif__item">
                <span
                  className="portal-notif__dot"
                  style={{ background: CATEGORY_COLOUR[item.category] }}
                  aria-hidden
                />
                <div className="portal-notif__body">
                  <div className="portal-notif__item-title">{item.title}</div>
                  <div className="portal-notif__desc">{item.description}</div>
                  <div className="portal-notif__time">{item.time}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="portal-notif__footer">
          <button
            type="button"
            className="portal-notif__action"
            onClick={onMarkAllRead}
            disabled={!hasUnread}
          >
            {t("notifications.markAllRead")}
          </button>
          <button type="button" className="portal-notif__action">
            {t("notifications.viewAll")}
          </button>
        </div>
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
