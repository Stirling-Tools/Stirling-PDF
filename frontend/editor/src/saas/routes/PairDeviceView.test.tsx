import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import userEvent from "@testing-library/user-event";
import {
  PairDeviceView,
  type PairDeviceViewProps,
  type PendingPairing,
} from "@app/routes/PairDeviceView";

/**
 * The approval page is the security control in the pairing flow, so what it shows
 * and when it lets you act are the things worth pinning. Device grants are
 * phishable: the whole defence is that the approver can see what they are about to
 * connect and can walk away.
 *
 * i18n is not initialised in the saas vitest project, so t() renders the key. These
 * assert on keys, matching FreeLimitReachedModal.test.tsx. The instance-supplied
 * values (name, address, version, code) are real data and assert as themselves.
 */

const pending: PendingPairing = {
  userCode: "WXYZ-4821",
  name: "pdf-prod-01",
  version: "1.4.2",
  address: "203.0.113.44",
  requestedAt: null,
  expiresAt: null,
};

const base = {
  phase: "entry" as const,
  code: "",
  pending: null,
  busy: false,
  error: null,
  onCodeChange: () => {},
  onSubmitCode: () => {},
  onDecide: () => {},
};

/** @app/ui/Button wraps Mantine, so it needs the provider (as FreeLimitReachedModal does). */
function renderView(props: Partial<PairDeviceViewProps> = {}) {
  const result = render(
    <MantineProvider>
      <PairDeviceView {...base} {...props} />
    </MantineProvider>,
  );
  return {
    ...result,
    update: (next: Partial<PairDeviceViewProps>) =>
      result.rerender(
        <MantineProvider>
          <PairDeviceView {...base} {...next} />
        </MantineProvider>,
      ),
  };
}

describe("PairDeviceView", () => {
  it("holds Continue until a code is typed", () => {
    const { update } = renderView();
    expect(
      screen.getByRole("button", { name: "pair.entry.submit" }),
    ).toBeDisabled();

    // Whitespace is not a code.
    update({ code: "   " });
    expect(
      screen.getByRole("button", { name: "pair.entry.submit" }),
    ).toBeDisabled();

    update({ code: "WXYZ-4821" });
    expect(
      screen.getByRole("button", { name: "pair.entry.submit" }),
    ).toBeEnabled();
  });

  it("submits the typed code", async () => {
    const onSubmitCode = vi.fn();
    renderView({ code: "WXYZ-4821", onSubmitCode });

    await userEvent.click(
      screen.getByRole("button", { name: "pair.entry.submit" }),
    );

    expect(onSubmitCode).toHaveBeenCalledTimes(1);
  });

  it("names what is being paired so the approver can check it is theirs", () => {
    renderView({ phase: "confirm", pending });

    expect(screen.getByText("pdf-prod-01")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.44")).toBeInTheDocument();
    expect(screen.getByText("1.4.2")).toBeInTheDocument();
    expect(screen.getByText("WXYZ-4821")).toBeInTheDocument();
  });

  it("still renders the confirm step when the server sent no details", () => {
    renderView({
      phase: "confirm",
      pending: { ...pending, name: null, version: null, address: null },
    });

    // Blanks must read as unknown rather than vanishing, so a bare request is
    // visibly bare instead of looking like a well-described one.
    expect(screen.getByText("pair.confirm.unnamed")).toBeInTheDocument();
    expect(screen.getAllByText("pair.confirm.unknown")).toHaveLength(2);
  });

  it("offers declining as a peer of approving", async () => {
    const onDecide = vi.fn();
    renderView({ phase: "confirm", pending, onDecide });

    await userEvent.click(
      screen.getByRole("button", { name: "pair.confirm.decline" }),
    );
    expect(onDecide).toHaveBeenCalledWith(false);

    await userEvent.click(
      screen.getByRole("button", { name: "pair.confirm.approve" }),
    );
    expect(onDecide).toHaveBeenCalledWith(true);
  });

  it("holds both choices while a decision is in flight", () => {
    renderView({ phase: "confirm", pending, busy: true });

    expect(
      screen.getByRole("button", { name: "pair.confirm.decline" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "pair.confirm.approve" }),
    ).toBeDisabled();
  });

  it("shows the terminal steps", () => {
    const { update } = renderView({ phase: "done" });
    expect(screen.getByText("pair.done.title")).toBeInTheDocument();

    update({ phase: "declined" });
    expect(screen.getByText("pair.declined.title")).toBeInTheDocument();
  });

  it("renders nothing for confirm without a pairing to confirm", () => {
    renderView({ phase: "confirm", pending: null });

    expect(
      screen.queryByRole("button", { name: "pair.confirm.approve" }),
    ).not.toBeInTheDocument();
  });
});
