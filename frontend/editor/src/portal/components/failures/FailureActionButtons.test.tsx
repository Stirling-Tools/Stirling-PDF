import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FailureActionButtons } from "@portal/components/failures/FailureActionButtons";
import type {
  FailureActionOffer,
  FileRunEvent,
} from "@portal/api/fileRunEvents";

// @app/ui Button is a Mantine wrapper, so it needs the provider in the tree.
const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) => baseRender(ui, { wrapper: MantineProvider, ...options });

/**
 * The renderer is driven entirely by what the server sent, so a new failure kind or
 * label needs no change here. These pin that, plus the two rules the client owns:
 * skip unknown actions, confirm the ones that close an incident.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Mirrors i18next's contract closely enough to exercise the fallback logic:
    // a known key resolves, an unknown key returns its defaultValue.
    t: (key: string, options?: { defaultValue?: string } | string) => {
      const known: Record<string, string> = {
        "portal.failures.action.acknowledge": "Acknowledge",
        "portal.failures.action.dismiss": "Dismiss",
        "portal.failures.action.dismissSkipFile": "Skip this file",
        "portal.failures.action.confirm": "Are you sure?",
        "portal.failures.disabled.closed": "This failure is already closed.",
      };
      if (known[key]) return known[key];
      if (typeof options === "string") return options;
      if (options?.defaultValue) return options.defaultValue;
      return key;
    },
  }),
}));

function offer(
  overrides: Partial<FailureActionOffer> = {},
): FailureActionOffer {
  return {
    id: "ACKNOWLEDGE",
    labelKey: "portal.failures.action.acknowledge",
    enabled: true,
    disabledReasonKey: null,
    ...overrides,
  };
}

function event(actions: FailureActionOffer[]): FileRunEvent {
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
    fileId: "f-1",
    actor: "someone@example.com",
    occurrences: 1,
    status: "NEW",
    statusActor: null,
    actions,
    createdAt: 0,
    lastSeenAt: 0,
  };
}

describe("FailureActionButtons", () => {
  it("renders one button per declared action, labelled from the server's key", () => {
    render(
      <FailureActionButtons
        event={event([
          offer(),
          offer({
            id: "DISMISS",
            labelKey: "portal.failures.action.dismissSkipFile",
          }),
        ])}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeTruthy();
    // The kind's override wins over the generic label, without the client
    // knowing which kinds override what.
    expect(screen.getByRole("button", { name: "Skip this file" })).toBeTruthy();
  });

  it("skips an action id this build cannot perform instead of crashing", () => {
    // The server may be newer than the client (notably on desktop). An
    // unrenderable button is worse than none.
    render(
      <FailureActionButtons
        event={event([
          offer(),
          offer({ id: "REMEDIATE_AND_RETRY", labelKey: "x" }),
        ])}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeTruthy();
  });

  it("renders nothing when no action is recognised", () => {
    const { container } = render(
      <FailureActionButtons
        event={event([offer({ id: "APPROVE", labelKey: "x" })])}
        onAction={vi.fn()}
      />,
    );

    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("falls back to the generic label when the server's key is unknown to this build", () => {
    render(
      <FailureActionButtons
        event={event([
          offer({ labelKey: "portal.failures.action.brandNewKey" }),
        ])}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeTruthy();
  });

  it("disables an action the server marked unusable and explains why", () => {
    render(
      <FailureActionButtons
        event={event([
          offer({
            enabled: false,
            disabledReasonKey: "portal.failures.disabled.closed",
          }),
        ])}
        onAction={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /already closed/ });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("dispatches a non-terminal action immediately", () => {
    const onAction = vi.fn();
    render(
      <FailureActionButtons event={event([offer()])} onAction={onAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    expect(onAction).toHaveBeenCalledWith("ACKNOWLEDGE");
  });

  it("asks for confirmation before dispatching a terminal action", () => {
    const onAction = vi.fn();
    render(
      <FailureActionButtons
        event={event([
          offer({ id: "DISMISS", labelKey: "portal.failures.action.dismiss" }),
        ])}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    // Dismiss closes the incident, so the first click only arms it.
    expect(onAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Are you sure?" }));
    expect(onAction).toHaveBeenCalledWith("DISMISS");
  });

  it("disables the action that is in flight", () => {
    render(
      <FailureActionButtons
        event={event([offer()])}
        onAction={vi.fn()}
        busyActionId="ACKNOWLEDGE"
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Acknowledge" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
