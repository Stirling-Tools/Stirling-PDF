import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FlowModal } from "@portal/components/shared/FlowModal";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";

/**
 * The shell backs every procurement and trial dialog, so its dismissal paths and its header/close
 * branching are the highest-traffic behaviour in the portal's flows.
 *
 * `hideClose` exists because a step with its own stepped header carries the close beside its step
 * badge. Getting that wrong is not cosmetic: shipping it once left a band containing nothing but a
 * stray close above the step's real heading, and shipping it the other way would leave a dialog with
 * no visible close at all.
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

  it("offers a close button by default, and it dismisses", () => {
    const onClose = open();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hides its close when the content owns one, keeping Escape as an exit", () => {
    const onClose = open({ hideClose: true });
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drops the header band entirely when there is neither a heading nor a close", () => {
    open({ hideClose: true });
    // The stray-close-above-the-real-heading regression: with nothing to put in it, no band at all.
    expect(document.querySelector(".portal-flowmodal__header")).toBeNull();
  });

  it("keeps the band when a heading is supplied even with the close hidden", () => {
    open({ hideClose: true, header: <h2>Heading</h2> });
    expect(document.querySelector(".portal-flowmodal__header")).not.toBeNull();
    expect(screen.getByText("Heading")).toBeInTheDocument();
  });

  it("renders the footer only when given one", () => {
    open({ footer: <button type="button">Continue</button> });
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
  });
});
