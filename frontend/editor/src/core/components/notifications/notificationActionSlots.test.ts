import { describe, expect, it } from "vitest";
import { promoteActions } from "@app/components/notifications/notificationActionSlots";
import type {
  NotificationActionOffer,
  NotificationActionSlot,
} from "@app/services/notifications";

/**
 * The one rule that decides how loud a notification is allowed to be. Pinned against the shapes the
 * server actually sends for the two failure kinds that exist, because the promotions are only
 * correct in combination: what is left over depends on what won the buttons.
 *
 * Dispositions such as Dismiss never appear here: the projection carries only the actions the
 * client itself runs, so the bell is never handed a button it would refuse to draw.
 */

/**
 * The offers as `FailureKind` declares them. An unrecognised failure has no known fix, so its retry
 * is only ever a supporting action; a password failure has one, and its plain retry drops in behind
 * the unlock.
 */
const UNKNOWN_OFFERS: Record<string, NotificationActionOffer> = {
  RETRY: offer("RETRY", "SECONDARY"),
  VIEW_IN_PROCESSOR: offer("VIEW_IN_PROCESSOR", "SECONDARY"),
  VIEW_FILE: offer("VIEW_FILE", "OVERFLOW"),
};

const PASSWORD_OFFERS: Record<string, NotificationActionOffer> = {
  DECRYPT_AND_RETRY: offer("DECRYPT_AND_RETRY", "RESOLUTION"),
  RETRY: offer("RETRY", "OVERFLOW"),
  VIEW_FILE: offer("VIEW_FILE", "OVERFLOW"),
  VIEW_IN_PROCESSOR: offer("VIEW_IN_PROCESSOR", "SECONDARY"),
};

/** The reasons the server sends with an action it would refuse. */
const NO_DOCUMENT = "portal.failures.disabled.noDocument";
const UNATTENDED = "portal.failures.disabled.unattended";
const CLOSED = "portal.failures.disabled.closed";

function offer(
  id: string,
  slot: NotificationActionSlot,
  overrides: Partial<NotificationActionOffer> = {},
): NotificationActionOffer {
  return {
    id,
    labelKey: `portal.failures.action.${id.toLowerCase()}`,
    defaultLabel: id,
    slot,
    enabled: true,
    disabledReasonKey: null,
    ...overrides,
  };
}

function from(
  declared: Record<string, NotificationActionOffer>,
  ids: string[],
): NotificationActionOffer[] {
  return ids.map((id) => {
    const found = declared[id];
    if (!found) throw new Error(`That kind offers no ${id}`);
    return found;
  });
}

/** What the server sends for an unrecognised failure, for a reader offered these actions. */
const unknown = (...ids: string[]) => from(UNKNOWN_OFFERS, ids);

/** The same for a password-protected one. */
const password = (...ids: string[]) => from(PASSWORD_OFFERS, ids);

/** The same offers, with the named ones marked as the server would refuse them, and why. */
function refusing(
  offers: NotificationActionOffer[],
  reasonKey: string,
  ...ids: string[]
): NotificationActionOffer[] {
  return offers.map((action) =>
    ids.includes(action.id)
      ? { ...action, enabled: false, disabledReasonKey: reasonKey }
      : action,
  );
}

/** Everything this client can do, as the registry would answer with the file on this device. */
const RUNNABLE = new Set([
  "RETRY",
  "DECRYPT_AND_RETRY",
  "VIEW_FILE",
  "VIEW_IN_PROCESSOR",
]);

/** The predicate the bell supplies: a known id, on a device that can act on it. */
const canRun = (action: NotificationActionOffer) => RUNNABLE.has(action.id);

/** The build's knowledge alone, which is what gates a withheld reason. */
const knowsAction = (action: NotificationActionOffer) =>
  RUNNABLE.has(action.id);

function promoted(list: NotificationActionOffer[]) {
  const { primary, secondary, overflow, withheldReasonKey } = promoteActions(
    list,
    canRun,
    knowsAction,
  );
  return {
    primary: primary?.id ?? null,
    secondary: secondary?.id ?? null,
    overflow: overflow.map((action) => action.id),
    withheldReasonKey,
  };
}

describe("promoteActions", () => {
  it("gives the owner the retry, and keeps the rest quiet behind it", () => {
    // No portal access, so the server never offered the processor link.
    expect(promoted(unknown("RETRY", "VIEW_FILE"))).toEqual({
      primary: "RETRY",
      secondary: null,
      overflow: ["VIEW_FILE"],
      withheldReasonKey: null,
    });
  });

  it("leads an attended policy failure with the queue, and states what was refused", () => {
    // The document is not the reader's to open, so a greyed unlock would be false hope: the row loses
    // the buttons and keeps the explanation.
    expect(
      promoted(
        refusing(
          unknown("RETRY", "VIEW_IN_PROCESSOR", "VIEW_FILE"),
          NO_DOCUMENT,
          "RETRY",
          "VIEW_FILE",
        ),
      ),
    ).toEqual({
      primary: "VIEW_IN_PROCESSOR",
      secondary: null,
      overflow: [],
      withheldReasonKey: NO_DOCUMENT,
    });
  });

  it("leads an unattended failure with the queue, and says retrying is not available", () => {
    // Nobody holds the document, so retrying is coming rather than missing. One reason for the row,
    // taken from the best thing it lost.
    expect(
      promoted(
        refusing(
          unknown("RETRY", "VIEW_IN_PROCESSOR", "VIEW_FILE"),
          UNATTENDED,
          "RETRY",
          "VIEW_FILE",
        ),
      ),
    ).toEqual({
      primary: "VIEW_IN_PROCESSOR",
      secondary: null,
      overflow: [],
      withheldReasonKey: UNATTENDED,
    });
  });

  it("explains nothing on a colleague's failure, having taken nothing away", () => {
    // Not their document, so nothing that needs the bytes was offered at all. There is no loss to
    // account for, and a note would only puzzle the reader.
    expect(promoted(unknown("VIEW_IN_PROCESSOR"))).toEqual({
      primary: "VIEW_IN_PROCESSOR",
      secondary: null,
      overflow: [],
      withheldReasonKey: null,
    });
  });

  it("leads a password failure with the unlock, not the plain retry", () => {
    // Running it again unchanged is a second answer to the same problem, so it drops behind.
    expect(
      promoted(password("DECRYPT_AND_RETRY", "RETRY", "VIEW_FILE")),
    ).toEqual({
      primary: "DECRYPT_AND_RETRY",
      secondary: null,
      overflow: ["RETRY", "VIEW_FILE"],
      withheldReasonKey: null,
    });
  });

  it("gives a reviewer their own password failure the unlock plus the queue", () => {
    expect(
      promoted(
        password(
          "DECRYPT_AND_RETRY",
          "RETRY",
          "VIEW_FILE",
          "VIEW_IN_PROCESSOR",
        ),
      ),
    ).toEqual({
      primary: "DECRYPT_AND_RETRY",
      secondary: "VIEW_IN_PROCESSOR",
      overflow: ["RETRY", "VIEW_FILE"],
      withheldReasonKey: null,
    });
  });

  it("leaves a closed row no buttons at all, only its reason", () => {
    // Already resolved elsewhere: every offer is refused, so the row is its message plus one line
    // saying why there is nothing left to do.
    expect(
      promoted(
        refusing(unknown("RETRY", "VIEW_FILE"), CLOSED, "RETRY", "VIEW_FILE"),
      ),
    ).toEqual({
      primary: null,
      secondary: null,
      overflow: [],
      withheldReasonKey: CLOSED,
    });
  });

  it("promotes past a resolution the shell cannot deliver", () => {
    // The owner reading their own password failure from the processor: that shell has no FileContext,
    // so the unlock has nowhere to put its output and reports itself unavailable. What is left is
    // coherent on its own - the queue becomes the row's button.
    const inProcessor = (action: NotificationActionOffer) =>
      action.id !== "DECRYPT_AND_RETRY" && canRun(action);

    const { primary, secondary, overflow } = promoteActions(
      password("DECRYPT_AND_RETRY", "RETRY", "VIEW_FILE", "VIEW_IN_PROCESSOR"),
      inProcessor,
      knowsAction,
    );

    expect(primary?.id).toBe("VIEW_IN_PROCESSOR");
    expect(secondary).toBeNull();
    expect(overflow.map((action) => action.id)).toEqual(["RETRY", "VIEW_FILE"]);
  });

  it("drops a client action this device cannot perform, without inventing a reason", () => {
    // The document is gone from this browser: the actions disappear rather than failing on click. The
    // server withheld nothing, so the row has no server reason and the bell falls back to what this
    // device knows.
    const { primary, overflow, withheldReasonKey } = promoteActions(
      unknown("RETRY", "VIEW_FILE"),
      () => false,
      knowsAction,
    );

    expect(primary).toBeNull();
    expect(overflow).toEqual([]);
    expect(withheldReasonKey).toBeNull();
  });

  it("skips an action id it has never heard of without touching the rest", () => {
    // The server ships a kind with a new action before this build knows what it means.
    const list = [offer("QUARANTINE", "RESOLUTION"), ...unknown("RETRY")];

    expect(promoted(list)).toEqual({
      primary: "RETRY",
      secondary: null,
      overflow: [],
      withheldReasonKey: null,
    });
  });

  it("has nothing to promote when nothing survives", () => {
    expect(promoteActions([], () => true, () => true)).toEqual({
      primary: null,
      secondary: null,
      overflow: [],
      withheldReasonKey: null,
    });
  });

  it("never explains the row with an action this build has never heard of", () => {
    // The server ships a new action, disabled with a reason, to a client that predates it.
    // That client could never have drawn the button, so the reason is not its row's story.
    const list = [
      offer("QUARANTINE", "RESOLUTION", {
        enabled: false,
        disabledReasonKey: NO_DOCUMENT,
      }),
      ...unknown("VIEW_IN_PROCESSOR"),
    ];

    expect(promoted(list)).toEqual({
      primary: "VIEW_IN_PROCESSOR",
      secondary: null,
      overflow: [],
      withheldReasonKey: null,
    });
  });

  it("takes the reason from the best action lost, not the first declared", () => {
    // Two refusals, one row: the reader gets the one attached to the action they would have reached
    // for first.
    const list = [
      offer("VIEW_FILE", "OVERFLOW", {
        enabled: false,
        disabledReasonKey: CLOSED,
      }),
      offer("DECRYPT_AND_RETRY", "RESOLUTION", {
        enabled: false,
        disabledReasonKey: NO_DOCUMENT,
      }),
      ...password("VIEW_IN_PROCESSOR"),
    ];

    expect(promoted(list).withheldReasonKey).toBe(NO_DOCUMENT);
  });
});
