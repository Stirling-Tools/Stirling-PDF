import type { AppNotification } from "@app/services/notifications";
import type { RetryPayload } from "@app/services/notificationRetry";

/**
 * What this client can do about a notification, keyed by the action id the server offered. Keyed by
 * action rather than by row because the server decides which actions a failure kind offers: adding a
 * kind is no frontend change, and adding a button is one entry here.
 */

/** Everything an action needs to decide whether it can run, and to run. */
export interface NotificationActionContext {
  notification: AppNotification;
  /** Whether the document is still in this browser, which is what most actions hinge on. */
  hasLocalFile: boolean;
  /** What the failed operation was, when this browser stashed it. */
  retryPayload: RetryPayload | null;
}

/**
 * How a client action reports back. `void` means it did what it said, usually a navigation; a failed
 * outcome carries the message the row shows, because an action that quietly does nothing leaves the
 * user guessing.
 */
export interface ClientActionOutcome {
  ok: boolean;
  message?: string;
}

export interface ClientActionSpec {
  /** Whether this device can perform it right now. Asked per row, never during a request. */
  available(context: NotificationActionContext): boolean;
  /** `password` is only ever passed for a spec that asked for one. May answer synchronously. */
  run(
    context: NotificationActionContext,
    password?: string,
  ): ClientActionOutcome | void | Promise<ClientActionOutcome | void>;
  /** Collect a password in the row before running. Never stored, never logged. */
  needsPassword?: boolean;
  /** Whether the panel should get out of the way, because the destination is behind it. */
  closesPanel?: boolean;
}

/**
 * Indexed by action id. An id with no entry is skipped rather than rendered unwired: the server can
 * ship a new failure kind, with new actions, long before a client knows what they mean.
 */
export type ClientActionRegistry = Readonly<
  Record<string, ClientActionSpec | undefined>
>;

const NONE: ClientActionRegistry = {};

/**
 * Nothing is offered here: every destination a notification could point at ships in a higher layer, so
 * a build without them has nowhere to send anyone, so its rows carry no buttons.
 */
export function useNotificationActions(): ClientActionRegistry {
  return NONE;
}
