import type { AppNotification } from "@app/services/notifications";
import type { RetryPayload } from "@app/services/notificationRetry";

/**
 * Keyed by action rather than by row, because the server decides what a kind offers: adding a kind is
 * no frontend change, and adding a button is one entry here.
 */

export interface NotificationActionContext {
  notification: AppNotification;
  /** Whether the document is still in this browser, which is what most actions hinge on. */
  hasLocalFile: boolean;
  /** What the failed operation was, when this browser stashed it. */
  retryPayload: RetryPayload | null;
}

/** `void` means it did what it said; a failed outcome carries the message the row shows. */
export interface ClientActionOutcome {
  ok: boolean;
  message?: string;
}

export interface ClientActionSpec {
  /** Asked per row, never during a request. */
  available(context: NotificationActionContext): boolean;
  /** `password` is only ever passed for a spec that asked for one. May answer synchronously. */
  run(
    context: NotificationActionContext,
    password?: string,
  ): ClientActionOutcome | void | Promise<ClientActionOutcome | void>;
  /** Collect a password before running. Never stored, never logged. */
  needsPassword?: boolean;
  /** Whether the panel should get out of the way, the destination being behind it. */
  closesPanel?: boolean;
}

/** An id with no entry is skipped rather than rendered unwired. */
export type ClientActionRegistry = Readonly<
  Record<string, ClientActionSpec | undefined>
>;

const NONE: ClientActionRegistry = {};

/** Every destination ships in a higher layer, so this build's rows carry no buttons. */
export function useNotificationActions(): ClientActionRegistry {
  return NONE;
}
