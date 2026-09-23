import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FlowModal } from "@portal/components/shared/FlowModal";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

/**
 * The shell backs every procurement and trial dialog, so its dismissal paths and its header
 * branching are the highest-traffic behaviour in the portal's flows.
 *
 * The branching matters beyond looks: a step that draws its own stepped header carries the close
 * beside its step badge, so the shell must draw neither. Shipping that wrong once left a band
 * holding nothing but a stray close above the step's real heading; shipping it the other way would
 * leave a dialog with no visible close at all. Since the shell now delegates to the shared Modal,
 * "supplies no header" is what expresses it — the same convention the prepay checkout follows.
 */
function open(props: Partial<Parameters<typeof FlowModal>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <PortalTestProviders>
      <FlowModal open onClose={onClose} label="Test dialog" {...props}>
        <p>body</p>
      </FlowModal>
    </PortalTestProviders>,
  );
  return onClose;
}

describe("FlowModal", () => {
  it("renders nothing while closed", () => {
    const onClose = vi.fn();
    render(
      <PortalTestProviders>
        <FlowModal open={false} onClose={onClose} label="Test dialog">
          <p>body</p>
        </FlowModal>
      </PortalTestProviders>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape", () => {
    const onClose = open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop click but not on a click inside the panel", () => {
    const onClose = open();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("draws a header band with a working close when given a header", () => {
    const onClose = open({ header: <h2>Heading</h2> });
    expect(document.querySelector(".sui-modal__header")).not.toBeNull();
    expect(screen.getByText("Heading")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drops the band, close included, when the content owns its header", () => {
    const onClose = open();
    expect(document.querySelector(".sui-modal__header")).toBeNull();
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();

    // Never inescapable: the step's own close aside, Escape still exits.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("names the dialog from `label` when the content owns the heading", () => {
    open();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Test dialog");
  });

  it("names the dialog from the header once one is supplied", () => {
    open({ header: <h2>Heading</h2> });
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("aria-label");
    expect(dialog).toHaveAccessibleName("Heading");
  });

  it("renders the footer only when given one", () => {
    open({ footer: <button type="button">Continue</button> });
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
  });
});
