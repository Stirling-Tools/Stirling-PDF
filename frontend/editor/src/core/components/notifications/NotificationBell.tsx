import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Menu, Tooltip } from "@mantine/core";
import { Button } from "@app/ui";
import { ActionIcon } from "@app/ui/ActionIcon";
import { BellIcon } from "@app/components/notifications/BellIcon";
import DividerWithText from "@app/components/shared/DividerWithText";
import EncryptedPdfUnlockModal from "@app/components/shared/EncryptedPdfUnlockModal";
import {
  isResolvableHere,
  useNotifications,
} from "@app/hooks/useNotifications";
import {
  useNotificationActions,
  type ClientActionRegistry,
  type ClientActionSpec,
  type NotificationActionContext,
} from "@app/components/notifications/notificationActions";
import { promoteActions } from "@app/components/notifications/notificationActionSlots";
import type {
  AppNotification,
  NotificationActionOffer,
} from "@app/services/notifications";
import type { NotificationDocumentState } from "@app/hooks/useNotifications";
import "@app/components/notifications/NotificationBell.css";

/**
 * Renders whatever the server sends without knowing which subsystem produced it or what its actions
 * mean, so a new source or failure kind needs no change here. In core because both shells mount it.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, documentStateFor, markAllSeen, refresh } =
    useNotifications();
  const registry = useNotificationActions();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const headingId = useId();
  /**
   * Where the new ones stop, frozen on open. An id rather than a count because opening marks
   * everything read, and because one arriving on a poll must land above the divider, not shift it.
   */
  const [firstSeenId, setFirstSeenId] = useState<string | null>(null);
  // Fixed to the viewport: the workbench bar clips its overflow, so an absolutely positioned panel
  // would be cut off by its own toolbar.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
    null,
  );
  /**
   * The action waiting on a password, held by the panel rather than the row that offered it: the
   * panel closes on any click beyond itself, which would tear down a prompt a row owned.
   */
  const [prompt, setPrompt] = useState<PasswordPrompt | null>(null);
  // Held only while the prompt is open, and dropped as soon as it closes. Never stashed, never logged.
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
    // A wrong password lands here carrying the server's own words. The prompt stays open on top of
    // them, so the next attempt costs a keystroke rather than a re-open.
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
    // A password action resolves the incident server-side, so the list is re-read rather than
    // patched here.
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
      // An overflow menu is portaled outside the panel, so a click in it reads as outside; keep the
      // panel open for it, or picking a menu action would tear the panel down before it ran.
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

      {/* Rendered beside the panel rather than inside it: the same modal the app uses for a locked
          upload, and it has to outlive the panel dismissing behind it. */}
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

/** An action that asked for a password, with everything running it needs. */
interface PasswordPrompt {
  offer: NotificationActionOffer;
  spec: ClientActionSpec;
  context: NotificationActionContext;
  /** The row's title, so the prompt can say which failure it is unlocking for. */
  rowTitle: string;
}

/**
 * The server's reason wins, being about the failure rather than this browser. Otherwise only what we
 * actually looked up, so a row we never probed is never called absent.
 */
/** The kind's own sentence, sharing the portal's copy. Empty for a kind this build has none for. */
function summaryKeyOf(titleKey: string): string {
  return titleKey.replace(/\.title$/, ".description");
}

function noteFor(
  notification: AppNotification,
  documentState: NotificationDocumentState,
  withheldReasonKey: string | null,
  t: TFunction,
): string | null {
  if (withheldReasonKey)
    return t(withheldReasonKey, {
      defaultValue: t(
        "notifications.action.unavailable",
        "Not available for this notification.",
      ),
    });
  if (notification.ownership !== "MINE" || documentState.hasLocalFile)
    return null;
  if (!notification.fileId)
    return t(
      "notifications.noDocumentLinked",
      "This failure is not linked to a specific document, so it cannot be opened or retried here.",
    );
  return isResolvableHere(notification)
    ? t(
        "notifications.notOnThisDevice",
        "This document is not on this device, so it cannot be opened or retried here.",
      )
    : null;
}

interface NotificationItemProps {
  notification: AppNotification;
  unread: boolean;
  documentState: NotificationDocumentState;
  registry: ClientActionRegistry;
  onDismissPanel: () => void;
  /** Hand a password-collecting action to the panel, which owns the prompt. */
  onRequestPassword: (prompt: PasswordPrompt) => void;
}

/** Its own component because the last attempt's message and the copy state are per-row. */
function NotificationItem({
  notification,
  unread,
  documentState,
  registry,
  onDismissPanel,
  onRequestPassword,
}: NotificationItemProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const title = t(notification.titleKey, notification.defaultTitle);
  const context: NotificationActionContext = {
    notification,
    hasLocalFile: documentState.hasLocalFile,
    retryPayload: documentState.retryPayload,
  };

  const { primary, secondary, overflow, withheldReasonKey } = promoteActions(
    notification.actions,
    (offer) => {
      const spec = registry[offer.id];
      // An id this build has never heard of: skipped, not rendered unwired. The server ships new kinds
      // and their actions ahead of the clients that understand them.
      if (!spec) return false;
      return spec.available(context);
    },
  );

  const labelOf = (offer: NotificationActionOffer) =>
    t(offer.labelKey, offer.defaultLabel);

  const run = async (offer: NotificationActionOffer) => {
    if (busy) return;
    setMessage(null);

    const spec = registry[offer.id];
    if (!spec) return;
    // A password action is handed to the panel, which prompts for it and runs it from there.
    if (spec.needsPassword) {
      onRequestPassword({ offer, spec, context, rowTitle: title });
      return;
    }

    setBusy(offer.id);
    const outcome = await spec.run(context);
    setBusy(null);
    if (outcome && !outcome.ok) {
      setMessage(
        outcome.message ??
          t(
            "notifications.action.failed",
            "That did not work. Try again in a moment.",
          ),
      );
      return;
    }

    if (spec.closesPanel) onDismissPanel();
  };

  const copyDetail = async () => {
    if (!notification.detail) return;
    try {
      await navigator.clipboard.writeText(notification.detail);
      setCopied(true);
    } catch {
      // No clipboard permission, and the message is on screen and selectable anyway.
    }
  };

  const note = noteFor(notification, documentState, withheldReasonKey, t);
  const summary = t(summaryKeyOf(notification.titleKey), { defaultValue: "" });

  return (
    <li
      className="notification-bell__item"
      data-severity={notification.severity.toLowerCase()}
    >
      {unread && (
        <span
          className="notification-bell__dot"
          aria-label={t("notifications.unread", "Unread")}
        />
      )}
      <span className="notification-bell__item-title">{title}</span>
      {notification.occurrences > 1 && (
        <span className="notification-bell__count">
          {t("notifications.occurrences", {
            count: notification.occurrences,
            defaultValue: "{{count}} times",
          })}
        </span>
      )}

      {summary && <span className="notification-bell__detail">{summary}</span>}

      {note && <span className="notification-bell__note">{note}</span>}

      {/* Two buttons at most, then a menu: the row's own answer, one runner-up, and the rest tucked
          out of the way so a row of near-equal buttons never competes for the click. */}
      {primary && (
        <span className="notification-bell__actions">
          <ActionButton
            variant="primary"
            rowTitle={title}
            label={labelOf(primary)}
            busy={busy === primary.id}
            onRun={() => void run(primary)}
          />
          {secondary && (
            <ActionButton
              variant="secondary"
              rowTitle={title}
              label={labelOf(secondary)}
              busy={busy === secondary.id}
              onRun={() => void run(secondary)}
            />
          )}
          {(overflow.length > 0 || notification.detail) && (
            <Menu withinPortal position="bottom-end" shadow="md" width={180}>
              <Menu.Target>
                <Tooltip
                  label={t("notifications.action.more", "More options")}
                  withinPortal
                >
                  <ActionIcon
                    variant="tertiary"
                    size="sm"
                    className="notification-bell__more"
                    aria-label={`${t("notifications.action.more", "More options")}: ${title}`}
                  >
                    <MoreIcon />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown className="notification-bell__menu">
                {overflow.map((offer) => (
                  <Menu.Item
                    key={offer.id}
                    disabled={busy === offer.id}
                    onClick={() => void run(offer)}
                  >
                    {labelOf(offer)}
                  </Menu.Item>
                ))}
                {notification.detail && (
                  <Menu.Item
                    closeMenuOnClick={false}
                    onClick={() => void copyDetail()}
                  >
                    {copied
                      ? t("notifications.action.copiedLog", "Copied")
                      : t("notifications.action.copyLog", "Copy log")}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </span>
      )}

      {message && (
        <span className="notification-bell__message" role="alert">
          {message}
        </span>
      )}
    </li>
  );
}

interface ActionButtonProps {
  /** Solid for the row's answer, outlined for its runner-up, ghost for the rest. */
  variant: "primary" | "secondary" | "tertiary";
  rowTitle: string;
  label: string;
  busy: boolean;
  onRun: () => void;
}

function ActionButton({
  variant,
  rowTitle,
  label,
  busy,
  onRun,
}: ActionButtonProps) {
  return (
    <Button
      variant={variant}
      size="sm"
      fontSize="xs"
      className="notification-bell__cta"
      disabled={busy}
      // Every row's buttons read alike, so the label alone would not say which failure this acts on.
      aria-label={`${label}: ${rowTitle}`}
      onClick={onRun}
    >
      {label}
    </Button>
  );
}

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function MoreIcon() {
  return (
    <svg {...ICON_PROPS} strokeWidth={2.5}>
      <circle cx="5" cy="12" r="0.5" />
      <circle cx="12" cy="12" r="0.5" />
      <circle cx="19" cy="12" r="0.5" />
    </svg>
  );
}
