import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { PairingView } from "@portal/api/link";
import { PairingPanelView } from "@portal/components/account-link/PairingPanelView";

/**
 * The approval link is the one part of this panel with logic behind it: it has to be
 * a real link, open away from this tab, and carry the code so the admin does not
 * retype eight characters on another device.
 */
const waiting = (over: Partial<PairingView> = {}): PairingView => ({
  phase: "waiting",
  userCode: "WXYZ-4821",
  verificationUri: "https://stirling.com/link",
  expiresAt: null,
  intervalSeconds: 5,
  ...over,
});

const renderView = (view: PairingView | null) =>
  render(
    <MantineProvider>
      <PairingPanelView
        view={view}
        secondsLeft={587}
        loading={false}
        error={null}
        onRetry={() => {}}
      />
    </MantineProvider>,
  );

describe("PairingPanelView approval link", () => {
  it("is a link that opens away from this tab, with the code prefilled", () => {
    renderView(waiting());

    const link = screen.getByRole("link", {
      name: "https://stirling.com/link",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://stirling.com/link?code=WXYZ-4821",
    );
    expect(link).toHaveAttribute("target", "_blank");
    // Without noreferrer the opened page gets a handle on this one.
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("adds the code to a URI that already has a query", () => {
    renderView(
      waiting({ verificationUri: "https://stirling.com/app/link?ref=x" }),
    );

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://stirling.com/app/link?ref=x&code=WXYZ-4821",
    );
  });

  it("still renders a followable link when the URI cannot be parsed", () => {
    renderView(waiting({ verificationUri: "not-a-url" }));

    // Better a plain link the admin can read than a mangled one, or none.
    expect(screen.getByRole("link")).toHaveAttribute("href", "not-a-url");
  });

  it("keeps the code on screen as well as in the link", () => {
    renderView(waiting());

    // The admin may be approving on a phone, where this tab is no use to them.
    expect(screen.getByLabelText(/pairing code/i)).toHaveTextContent(
      "WXYZ-4821",
    );
  });

  it("renders no link when there is no verification URI", () => {
    renderView(waiting({ verificationUri: null }));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
