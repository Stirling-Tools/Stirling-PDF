import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { BellIcon, Button } from "@app/ui";
import DividerWithText from "@app/components/shared/DividerWithText";
import EncryptedPdfUnlockModal from "@app/components/shared/EncryptedPdfUnlockModal";
import { useNotifications } from "@app/hooks/useNotifications";
import { useNotificationActions } from "@app/components/notifications/notificationActions";
import {
  NotificationItem,
  type PasswordPrompt,
} from "@app/components/notifications/NotificationItem";
import { useNotificationsAvailable } from "@app/components/notifications/useNotificationsAvailable";
import "@app/components/notifications/NotificationBell.css";

/**
 * Renders whatever the server sends without knowing which subsystem produced it or what its actions
 * mean, so a new source or failure kind needs no change here. In core because both shells mount it.
 */
export function NotificationBell() {
  // A build with no notifications API gets no bell at all, rather than one that polls a
  // nonexistent endpoint forever to show nothing.
  const available = useNotificationsAvailable();
  if (!available) return null;
  return <MountedNotificationBell />;
}

function MountedNotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, documentStateFor, markAllSeen, refresh } =
    useNotifications();
  const registry = useNotificationActions();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const headingId = useId();
  // Where the new ones stop, frozen when the panel opens (opening marks everything read).
  const [firstSeenId, setFirstSeenId] = useState<string | null>(null);
  // Viewport-fixed, because the workbench bar clips its own overflow.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
    null,
  );
  /** Held by the panel, not the row: the panel closes on any outside click. */
  const [prompt, setPrompt] = useState<PasswordPrompt | null>(null);
  // Dropped as soon as the prompt closes. Never stashed, never logged.
  const [password, setPassword] = useState("");
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const closePrompt = () => {
    setPrompt(null);
    setPassword("");
    setPromptError(null);
  };

  const submitPrompt = async () => {
    if (!prompt || promptBusy || password === "") return;
    setPromptBusy(true);
    setPromptError(null);
    const outcome = await prompt.spec.run(prompt.context, password);
    setPromptBusy(false);
    // The prompt stays open, so a second attempt costs a keystroke rather than a re-open.
    if (outcome && !outcome.ok) {
      setPromptError(
        outcome.message ??
          t(
            "notifications.action.failed",
            "That did not work. Try again in a moment.",
          ),
      );
      return;
    }
    closePrompt();
    // The incident was resolved server-side, so the list is re-read rather than patched here.
    refresh();
    if (prompt.spec.closesPanel) setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = container.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  // Opening marks them read, not closing: waiting would leave the badge lit while they read.
  const toggle = () => {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        // Before marking, or there is nothing left to read.
        setFirstSeenId(notifications[unreadCount]?.id ?? null);
        markAllSeen();
      }
      return !wasOpen;
    });
  };

  /**
   * How many count as new. No boundary id means all of them were; one that has since left the list
   * leaves nothing to divide on, so it reads as none rather than guessing at a row.
   */
  const boundaryIndex = firstSeenId
    ? notifications.findIndex((notification) => notification.id === firstSeenId)
    : notifications.length;
  const dividedAt = Math.max(0, boundaryIndex);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (container.current?.contains(target)) return;
      // The overflow menu is portaled out, so a click in it would read as outside the panel.
      if (target.closest(".notification-bell__menu")) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="notification-bell" ref={container}>
      <Button
        variant="quiet"
        size="md"
        shape="circle"
        className="notification-bell__trigger"
        aria-label={t("notifications.open", "Notifications")}
        aria-expanded={open}
        onClick={toggle}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notification-bell__badge" aria-hidden>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          className="notification-bell__panel"
          role="dialog"
          // Named by its own heading: a dialog with no accessible name is announced as just "dialog".
          aria-labelledby={headingId}
          style={anchor ? { top: anchor.top, right: anchor.right } : undefined}
        >
          <h2 className="notification-bell__heading" id={headingId}>
            {t("notifications.title", "Notifications")}
          </h2>

          {notifications.length === 0 ? (
            <p className="notification-bell__empty">
              {t("notifications.empty", "You're all caught up.")}
            </p>
          ) : (
            <ul className="notification-bell__list">
              {notifications.map((notification, index) => (
                <Fragment key={notification.id}>
                  {index === 0 && dividedAt > 0 && (
                    <li aria-hidden>
                      <DividerWithText
                        className="notification-bell__divider notification-bell__divider--new"
                        text={t("notifications.section.new", "New")}
                      />
                    </li>
                  )}
                  {/* Only with something on both sides: a lone "Earlier" over everything says
                      nothing the empty badge has not. */}
                  {index === dividedAt && dividedAt > 0 && (
                    <li aria-hidden>
                      <DividerWithText
                        className="notification-bell__divider"
                        text={t("notifications.section.earlier", "Earlier")}
                      />
                    </li>
                  )}
                  <NotificationItem
                    notification={notification}
                    unread={index < dividedAt}
                    documentState={documentStateFor(notification)}
                    registry={registry}
                    onDismissPanel={() => setOpen(false)}
                    onRequestPassword={setPrompt}
                  />
                </Fragment>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Beside the panel, not inside it: it has to outlive the panel dismissing behind it. */}
      <EncryptedPdfUnlockModal
        opened={prompt !== null}
        fileName={prompt?.rowTitle}
        password={password}
        errorMessage={promptError}
        isProcessing={promptBusy}
        confirmLabel={
          prompt
            ? t(prompt.offer.labelKey, prompt.offer.defaultLabel)
            : undefined
        }
        onPasswordChange={setPassword}
        onUnlock={() => void submitPrompt()}
        onSkip={closePrompt}
      />
    </div>
  );
}
