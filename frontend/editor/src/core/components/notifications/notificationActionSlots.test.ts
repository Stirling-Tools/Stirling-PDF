import { describe, expect, it } from "vitest";
import { promoteActions } from "@app/components/notifications/notificationActionSlots";
import type {
  NotificationActionOffer,
  NotificationActionSlot,
} from "@app/services/notifications";

// Pinned against the shapes the server sends: what is left over depends on what won the buttons.

/** The offers as `FailureKind` declares them for an unrecognised failure. */
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

const unknown = (...ids: string[]) => from(UNKNOWN_OFFERS, ids);

const password = (...ids: string[]) => from(PASSWORD_OFFERS, ids);

/** The same offers, with the named ones refused as the server would refuse them. */
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

/** Everything this client can do, with the file on this device. */
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
    // Not the reader's document, so a greyed unlock would be false hope: the note stays instead.
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
    // Nobody holds the document: one reason for the row, from the best thing it lost.
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
    // Nothing needing the bytes was offered, so there is no loss to account for.
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
    // Already closed elsewhere: every offer refused, so the row is its message plus one line.
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
    // Read from the processor, which has no FileContext, so the unlock reports itself unavailable.
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
    // The document is gone from this browser: the actions disappear rather than fail on click.
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
    expect(
      promoteActions(
        [],
        () => true,
        () => true,
      ),
    ).toEqual({
      primary: null,
      secondary: null,
      overflow: [],
      withheldReasonKey: null,
    });
  });

  it("never explains the row with an action this build has never heard of", () => {
    // A client that could never have drawn the button is not explained by its reason.
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
    // Two refusals, one row: the reader gets the one they would have reached for first.
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
