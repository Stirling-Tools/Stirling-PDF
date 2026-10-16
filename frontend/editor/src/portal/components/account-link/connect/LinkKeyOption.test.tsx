import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

const redeemLinkKey = vi.hoisted(() => vi.fn());
vi.mock("@app/services/linkKey", async (original) => ({
  ...(await original<typeof import("@app/services/linkKey")>()),
  redeemLinkKey,
}));

import { LinkKeyOption } from "@app/portal/components/account-link/connect/LinkKeyOption";
import { LinkKeyError } from "@app/services/linkKey";

const KEY =
  "stlk_AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function mount(onLinked = vi.fn()) {
  render(
    <MantineProvider>
      <LinkKeyOption onLinked={onLinked} />
    </MantineProvider>,
  );
  return onLinked;
}

function open() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Have a link key from Stirling Cloud?",
    }),
  );
  return screen.getByLabelText("Link key");
}

describe("LinkKeyOption", () => {
  beforeEach(() => {
    redeemLinkKey.mockReset().mockResolvedValue(undefined);
  });

  it("stays out of the way until asked for", () => {
    mount();
    expect(screen.queryByLabelText("Link key")).toBeNull();
  });

  it("connects with a pasted key", async () => {
    const onLinked = mount();
    fireEvent.change(open(), { target: { value: KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Connect with key" }));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(redeemLinkKey).toHaveBeenCalledWith(KEY);
  });

  it("points a pasted license key at the right field instead of sending it", () => {
    mount();
    fireEvent.change(open(), {
      target: { value: "00000000-0000-0000-0000-000000000000" },
    });
    expect(
      screen.getByText(/A license key goes under Usage & Billing/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Connect with key" }),
    ).toBeDisabled();
  });

  it("keeps the field after a refusal so a fresh key can be pasted", async () => {
    redeemLinkKey.mockRejectedValue(new LinkKeyError("KEY_REJECTED"));
    const onLinked = mount();
    fireEvent.change(open(), { target: { value: KEY } });
    fireEvent.click(screen.getByRole("button", { name: "Connect with key" }));
    expect(await screen.findByText(/used, revoked or expired/)).toBeVisible();
    expect(screen.getByLabelText("Link key")).toBeEnabled();
    expect(onLinked).not.toHaveBeenCalled();
    // A fresh paste should not sit next to the last key's refusal.
    fireEvent.change(screen.getByLabelText("Link key"), {
      target: { value: KEY.slice(0, -1) + "C" },
    });
    expect(screen.queryByText(/used, revoked or expired/)).toBeNull();
  });
});
