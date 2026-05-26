import { useEffect, useState } from "react";
import { Dropdown, EmptyState, Skeleton } from "@shared/components";
import { BellIcon } from "@app/components/icons";
import { useAsync, useSectionFlags } from "@app/hooks/useAsync";
import {
  fetchNotifications,
  markAllNotificationsRead,
  type Notification,
  type NotificationCategory,
} from "@app/api/notifications";
import "@app/components/NotificationsDropdown.css";

const CATEGORY_COLOUR: Record<NotificationCategory, string> = {
  pipeline: "var(--color-blue)",
  deploy: "var(--color-green)",
  billing: "var(--color-amber)",
  audit: "var(--color-purple)",
  agent: "var(--color-cat-insurance)",
  doc: "var(--color-cat-healthcare)",
};

export function NotificationsDropdown() {
  const state = useAsync<Notification[]>(() => fetchNotifications(), []);
  const { data: items } = state;
  const { isLoading } = useSectionFlags(state);

  const [localItems, setLocalItems] = useState<Notification[] | null>(null);
  const visible = localItems ?? items ?? [];

  useEffect(() => {
    if (items) setLocalItems(items);
  }, [items]);

  async function onMarkAllRead() {
    setLocalItems([]);
    await markAllNotificationsRead();
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
              ? `Notifications, ${visible.length} unread`
              : "Notifications, no unread"
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
          <span className="portal-notif__title">Notifications</span>
          {hasUnread ? (
            <span className="portal-notif__count">{visible.length} new</span>
          ) : isLoading ? (
            <span className="portal-notif__count portal-notif__count--quiet">
              loading
            </span>
          ) : (
            <span className="portal-notif__count portal-notif__count--quiet">
              all read
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
            title="You're all caught up"
            description="No new notifications."
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
            Mark all read
          </button>
          <button type="button" className="portal-notif__action">
            View all
          </button>
        </div>
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
