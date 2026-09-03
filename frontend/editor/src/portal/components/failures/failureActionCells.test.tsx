import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { TFunction } from "i18next";
import { renderCellActions } from "@app/ui";
import { buildFailureActionCells } from "@portal/components/failures/failureActionCells";
import type {
  FailureActionOffer,
  FileRunEvent,
} from "@portal/api/fileRunEvents";

// @app/ui buttons are Mantine wrappers, so they need the provider in the tree.
const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) => baseRender(ui, { wrapper: MantineProvider, ...options });

/** The [Dismiss][menu] shape, the promotion order inside the menu, and that a
 * client-executed offer never reaches this surface. */

// Mirrors i18next closely enough: a known key resolves, an unknown one falls back.
const t = ((key: string, second?: { defaultValue?: string } | string) => {
  const known: Record<string, string> = {
    "portal.failures.action.acknowledge": "Acknowledge",
    "portal.failures.action.dismiss": "Dismiss",
  };
  if (known[key]) return known[key];
  if (typeof second === "string") return second;
  if (second?.defaultValue) return second.defaultValue;
  return key;
}) as TFunction;

function offer(overrides: Partial<FailureActionOffer>): FailureActionOffer {
  return {
    id: "ACKNOWLEDGE",
    labelKey: "portal.failures.action.acknowledge",
    defaultLabel: "Acknowledge",
    execution: "SERVER",
    slot: "SECONDARY",
    enabled: true,
    disabledReasonKey: null,
    ...overrides,
  };
}

function event(
  actions: FailureActionOffer[],
  overrides: Partial<FileRunEvent> = {},
): FileRunEvent {
  return {
    id: "evt-1",
    kindId: "UNKNOWN",
    stage: "INTERNAL",
    severity: "ERROR",
    scope: "RUN",
    origin: "POLICY",
    remedy: "PERMANENT",
    titleKey: "portal.failures.kind.unknown.title",
    descriptionKey: "portal.failures.kind.unknown.description",
    defaultTitle: "Unrecognised failure",
    detail: "boom",
    policyId: "p1",
    runId: "r1",
    sourceId: null,
    fileId: "f-1",
    actor: "someone@example.com",
    occurrences: 1,
    status: "NEW",
    statusActor: null,
    actions,
    createdAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
}

function build(
  failureEvent: FileRunEvent,
  overrides: Partial<Parameters<typeof buildFailureActionCells>[0]> = {},
) {
  return buildFailureActionCells({
    event: failureEvent,
    t,
    busyActionId: null,
    onAction: vi.fn(),
    onCopyLog: vi.fn(),
    ...overrides,
  });
}

const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: "More options" }));

describe("buildFailureActionCells", () => {
  it("shows only Dismiss and the menu, offers ordered by the server's slots", () => {
    render(
      <>
        {renderCellActions(
          build(
            event([
              offer({ id: "ACKNOWLEDGE", slot: "SECONDARY" }),
              offer({
                id: "DISMISS",
                slot: "OVERFLOW",
                labelKey: "portal.failures.action.dismiss",
                defaultLabel: "Dismiss",
              }),
            ]),
          ),
        )}
      </>,
    );

    // One flat button, everything else in the menu.
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    openMenu();
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Acknowledge", "Copy log"]);
  });

  it("drops every client-executed offer: reviewing stays in the processor", () => {
    render(
      <>
        {renderCellActions(
          build(
            event([
              offer({
                id: "VIEW_FILE",
                execution: "CLIENT",
                defaultLabel: "View file",
              }),
              offer({
                id: "DECRYPT_AND_RETRY",
                execution: "CLIENT",
                slot: "RESOLUTION",
                defaultLabel: "Decrypt and retry",
              }),
              offer({
                id: "VIEW_IN_PROCESSOR",
                execution: "CLIENT",
                defaultLabel: "View in processor",
              }),
              offer({ id: "ACKNOWLEDGE" }),
            ]),
          ),
        )}
      </>,
    );

    openMenu();
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(["Acknowledge", "Copy log"]);
  });

  it("posts the offer it was clicked with", () => {
    const onAction = vi.fn();
    render(
      <>
        {renderCellActions(
          build(event([offer({ id: "ACKNOWLEDGE" })]), { onAction }),
        )}
      </>,
    );

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Acknowledge" }));
    expect(onAction).toHaveBeenCalledWith("ACKNOWLEDGE");
  });

  it("keeps the log copyable from the menu on a row with nothing to resolve", () => {
    const onCopyLog = vi.fn();
    render(
      <>
        {renderCellActions(
          build(
            event([
              offer({
                id: "DISMISS",
                labelKey: "portal.failures.action.dismiss",
                defaultLabel: "Dismiss",
                slot: "OVERFLOW",
              }),
            ]),
            { onCopyLog },
          ),
        )}
      </>,
    );

    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy log" }));
    expect(onCopyLog).toHaveBeenCalled();
  });

  it("offers no Dismiss button on a closed row, whose dismiss came back disabled", () => {
    render(
      <>
        {renderCellActions(
          build(
            event([
              offer({
                id: "DISMISS",
                labelKey: "portal.failures.action.dismiss",
                defaultLabel: "Dismiss",
                slot: "OVERFLOW",
                enabled: false,
                disabledReasonKey: "portal.failures.disabled.closed",
              }),
            ]),
          ),
        )}
      </>,
    );

    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    // The log outlives the incident.
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Copy log" })).toBeTruthy();
  });

  it("renders nothing at all for a row with no offers and no log", () => {
    const cells = build(event([], { detail: null }));
    expect(cells).toHaveLength(0);
  });

  it("marks the action in flight busy", () => {
    render(
      <>
        {renderCellActions(
          build(
            event([
              offer({
                id: "DISMISS",
                labelKey: "portal.failures.action.dismiss",
                defaultLabel: "Dismiss",
                slot: "OVERFLOW",
              }),
            ]),
            { busyActionId: "DISMISS" },
          ),
        )}
      </>,
    );

    expect(
      screen.getByRole("button", { name: "Dismiss" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
