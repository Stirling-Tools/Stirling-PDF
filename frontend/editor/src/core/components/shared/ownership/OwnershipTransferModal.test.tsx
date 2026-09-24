import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import {
  OwnershipTransferModal,
  type OwnershipStatus,
  type OwnershipTransferAdapter,
} from "@app/components/shared/ownership/OwnershipTransferModal";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  const { createInstance } = await import("i18next");
  const i18n = createInstance();
  await i18n.use(actual.initReactI18next).init({
    lng: "en",
    resources: {},
    interpolation: { escapeValue: false },
  });
  return { ...actual, useTranslation: () => ({ t: i18n.t, i18n }) };
});

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

function status(
  state: "READY" | "NEEDS_MEMBERSHIP" | "TRANSFERRED" | null,
  paid = false,
): OwnershipStatus {
  return {
    targetId: 2,
    targetName: "Jamie",
    targetEmail: "jamie@example.com",
    cloud: state
      ? {
          teamId: 9,
          teamName: "Acme",
          leaderUserId: 1,
          targetUserId: state === "NEEDS_MEMBERSHIP" ? null : 2,
          linkedInstances: 3,
          subscribed: paid,
          state,
        }
      : null,
  };
}

describe("ownership handover", () => {
  let adapter: OwnershipTransferAdapter;
  const onTransferred = vi.fn();
  const onClose = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    adapter = {
      local: true,
      prepare: vi.fn().mockResolvedValue(status("READY")),
      invite: vi.fn().mockResolvedValue(status("NEEDS_MEMBERSHIP")),
      transferCloud: vi.fn().mockResolvedValue(status("TRANSFERRED")),
      completeLocal: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn(),
    };
  });
  function show() {
    return render(
      <MantineProvider env="test">
        <OwnershipTransferModal
          adapter={adapter}
          onClose={onClose}
          onTransferred={onTransferred}
        />
      </MantineProvider>,
    );
  }
  async function confirm() {
    await click(await screen.findByRole("checkbox"));
    await click(screen.getByRole("button", { name: "Transfer ownership" }));
  }

  function choosing(
    members: NonNullable<OwnershipStatus["candidates"]>["members"] = [
      { id: 42, name: "Jamie Cloud", email: "cloud@example.com" },
    ],
  ): OwnershipStatus {
    return {
      ...status(null),
      targetEmail: null,
      candidates: { teamId: 9, teamName: "Acme", members },
    };
  }

  it("selects a team member for a local user without an email and reviews both accounts", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(choosing());
    adapter.selectCloud = vi.fn().mockResolvedValue({
      ...status("READY"),
      targetEmail: null,
      cloudEmail: "cloud@example.com",
    });
    show();
    const input = await screen.findByRole("combobox", {
      name: "Stirling account",
    });
    expect(
      screen.getByRole("button", { name: "Transfer ownership" }),
    ).toBeDisabled();
    fireEvent.focus(input);
    await click(
      await screen.findByRole("option", { name: "cloud@example.com" }),
    );
    await screen.findByRole("checkbox");
    expect(adapter.selectCloud).toHaveBeenCalledWith({ cloudUserId: 42 });
    expect(screen.getByText("Server account")).toBeVisible();
    expect(screen.getAllByText("Jamie")[0]).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Stirling account" }),
    ).toHaveValue("cloud@example.com");
    expect(adapter.transferCloud).not.toHaveBeenCalled();
    await confirm();
    expect(screen.getByText("Ownership transferred")).toBeVisible();
  });

  it("Escape closes the email dropdown before dismissing the transfer", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(choosing());
    adapter.selectCloud = vi.fn();
    show();
    const input = await screen.findByRole("combobox", {
      name: "Stirling account",
    });
    fireEvent.focus(input);
    await screen.findByRole("option", { name: "cloud@example.com" });
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onClose).not.toHaveBeenCalled();
    expect(adapter.cancel).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closing a member picker does not create or cancel an intent", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(choosing());
    show();
    await click(
      await screen.findByRole("button", { name: "Close transfer dialog" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(adapter.cancel).not.toHaveBeenCalled();
    expect(adapter.transferCloud).not.toHaveBeenCalled();
  });

  it("guides an empty team through invitation and acceptance before offering transfer", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(choosing([]));
    const awaiting = {
      ...status("NEEDS_MEMBERSHIP"),
      targetEmail: null,
      cloudEmail: "new@example.com",
    };
    adapter.selectCloud = vi.fn().mockResolvedValue(awaiting);
    vi.mocked(adapter.invite!).mockResolvedValue(awaiting);
    show();
    await screen.findByRole("combobox", { name: "Stirling account" });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Stirling account" }),
      { target: { value: "invalid" } },
    );
    expect(
      screen.getByRole("button", { name: "Transfer ownership" }),
    ).toBeDisabled();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Stirling account" }),
      { target: { value: "new@example.com" } },
    );
    expect(adapter.invite).not.toHaveBeenCalled();
    await click(await screen.findByRole("button", { name: "Send invitation" }));
    expect(adapter.selectCloud).toHaveBeenCalledWith({
      cloudEmail: "new@example.com",
    });
    expect(await screen.findByText("Invitation sent")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Transfer ownership" }),
    ).toBeNull();
    expect(adapter.completeLocal).not.toHaveBeenCalled();
    vi.mocked(adapter.prepare).mockResolvedValue({
      ...status("READY"),
      cloudEmail: "new@example.com",
    });
    await click(screen.getByRole("button", { name: "Check again" }));
    await confirm();
    expect(screen.getByText("Ownership transferred")).toBeVisible();
  });

  it("keeps the picker open when a chosen member is no longer eligible", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(choosing());
    adapter.selectCloud = vi
      .fn()
      .mockRejectedValue(new Error("CLOUD_TARGET_CHANGED"));
    show();
    fireEvent.focus(
      await screen.findByRole("combobox", { name: "Stirling account" }),
    );
    await click(
      await screen.findByRole("option", { name: "cloud@example.com" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose another cloud member",
    );
    expect(adapter.transferCloud).not.toHaveBeenCalled();
    expect(adapter.completeLocal).not.toHaveBeenCalled();
  });

  it("focusing and reselecting a resumed account preserves the saved handover", async () => {
    adapter.selectCloud = vi.fn();
    adapter.loadCandidates = vi
      .fn()
      .mockResolvedValue(
        choosing([{ id: 2, name: null, email: "jamie@example.com" }])
          .candidates,
      );
    show();
    const input = await screen.findByRole("combobox", {
      name: "Stirling account",
    });
    fireEvent.focus(input);
    await click(
      await screen.findByRole("option", { name: "jamie@example.com" }),
    );
    fireEvent.blur(input);
    fireEvent.focus(input);
    expect(adapter.loadCandidates).toHaveBeenCalledOnce();
    expect(adapter.cancel).not.toHaveBeenCalled();
    expect(adapter.selectCloud).not.toHaveBeenCalled();
    expect(adapter.prepare).toHaveBeenCalledOnce();
    expect(input).toHaveValue("jamie@example.com");
    fireEvent.blur(input);
    await confirm();
    expect(adapter.completeLocal).toHaveBeenCalledOnce();
  });

  it.each(["TARGET_CHANGED", "TARGET_UNAVAILABLE"])(
    "offers checked cancellation when a saved recipient cannot be loaded: %s",
    async (reason) => {
      vi.mocked(adapter.prepare).mockRejectedValue(new Error(reason));
      show();
      await click(
        await screen.findByRole("button", { name: "Cancel transfer" }),
      );
      expect(adapter.cancel).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
      expect(adapter.transferCloud).not.toHaveBeenCalled();
      expect(adapter.completeLocal).not.toHaveBeenCalled();
    },
  );

  it("keeps checked cancellation blocked after cloud completion even without recipient status", async () => {
    vi.mocked(adapter.prepare).mockRejectedValue(
      new Error("TARGET_UNAVAILABLE"),
    );
    vi.mocked(adapter.cancel!).mockRejectedValue(
      new Error("FINISH_LOCAL_TRANSFER"),
    );
    show();
    await click(await screen.findByRole("button", { name: "Cancel transfer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cloud ownership has transferred",
    );
    expect(onClose).not.toHaveBeenCalled();
    await click(screen.getByRole("button", { name: "Close transfer dialog" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(adapter.cancel).toHaveBeenCalledOnce();
    expect(adapter.completeLocal).not.toHaveBeenCalled();
  });

  it("explains how to recover a retained link when linking is disabled", async () => {
    vi.mocked(adapter.prepare).mockRejectedValue(
      new Error("ACCOUNT_LINK_DISABLED"),
    );
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ask the server operator to enable account linking",
    );
    await click(screen.getByRole("button", { name: "Close transfer dialog" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(adapter.cancel).not.toHaveBeenCalled();
  });

  it("offers checked cancellation when a resumed link is revoked", async () => {
    vi.mocked(adapter.prepare).mockRejectedValue(new Error("LINK_REVOKED"));
    show();
    await click(await screen.findByRole("button", { name: "Cancel transfer" }));
    expect(adapter.cancel).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(adapter.completeLocal).not.toHaveBeenCalled();
  });

  it("keeps a revoked-link recovery open if cancellation cannot be verified", async () => {
    vi.mocked(adapter.prepare).mockRejectedValue(new Error("LINK_REVOKED"));
    vi.mocked(adapter.cancel!).mockRejectedValue(
      new Error("CLOUD_UNAVAILABLE"),
    );
    show();
    await click(await screen.findByRole("button", { name: "Cancel transfer" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: "Check again" }),
    ).toBeVisible();
  });

  it("changing the selected account cancels its draft before loading the member picker", async () => {
    adapter.selectCloud = vi.fn();
    show();
    await screen.findByRole("checkbox");
    vi.mocked(adapter.prepare).mockResolvedValue(choosing());
    fireEvent.change(
      screen.getByRole("combobox", { name: "Stirling account" }),
      { target: { value: "other@example.com" } },
    );
    await waitFor(() => expect(adapter.cancel).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("combobox", { name: "Stirling account" }),
    ).toHaveValue("other@example.com");
    expect(adapter.cancel).toHaveBeenCalledOnce();
    expect(adapter.transferCloud).not.toHaveBeenCalled();
  });

  it("unlinked transfer needs no cloud account", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(status(null));
    show();
    await confirm();
    await screen.findByText("Ownership transferred");
    expect(adapter.transferCloud).not.toHaveBeenCalled();
    expect(adapter.completeLocal).toHaveBeenCalledOnce();
  });

  it.each([null, "READY", "NEEDS_MEMBERSHIP"] as const)(
    "closing the dialog cancels an unfinished transfer in state %s",
    async (state) => {
      vi.mocked(adapter.prepare).mockResolvedValue(status(state));
      show();
      await click(
        await screen.findByRole("button", { name: "Close transfer dialog" }),
      );
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
      expect(adapter.cancel).toHaveBeenCalledOnce();
      expect(adapter.transferCloud).not.toHaveBeenCalled();
      expect(adapter.completeLocal).not.toHaveBeenCalled();
    },
  );

  it("Escape uses the same cancellation as the close button", async () => {
    show();
    await screen.findByRole("checkbox");
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("dialog"), {
        key: "Escape",
        code: "Escape",
      });
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(adapter.cancel).toHaveBeenCalledOnce();
  });

  it("waits for cancellation before dismissing", async () => {
    let resolveCancel!: () => void;
    vi.mocked(adapter.cancel!).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCancel = resolve;
      }),
    );
    show();
    await click(
      await screen.findByRole("button", { name: "Close transfer dialog" }),
    );
    expect(adapter.cancel).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      resolveCancel();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes the dialog after cancellation fails without completing the saved handover", async () => {
    vi.mocked(adapter.cancel!).mockRejectedValue(
      new Error("Cloud state unknown"),
    );
    show();
    await click(
      await screen.findByRole("button", { name: "Close transfer dialog" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(adapter.completeLocal).not.toHaveBeenCalled();
    expect(onTransferred).not.toHaveBeenCalled();
  });

  it("preserves the pending transfer when cloud ownership has already moved", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(status("TRANSFERRED"));
    show();
    await click(
      await screen.findByRole("button", { name: "Close transfer dialog" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(adapter.cancel).not.toHaveBeenCalled();
    expect(adapter.completeLocal).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "keeps success visible until Done before refreshing its host (local=%s)",
    async (local) => {
      adapter.local = local;
      const ready = status("READY");
      if (!local) ready.cloud!.linkedInstances = 0;
      vi.mocked(adapter.prepare).mockResolvedValue(ready);
      vi.mocked(adapter.transferCloud).mockResolvedValue({
        ...ready,
        cloud: { ...ready.cloud!, state: "TRANSFERRED" },
      });
      const view = show();
      onTransferred.mockImplementationOnce(() => view.unmount());
      await confirm();
      expect(await screen.findByText("Ownership transferred")).toBeVisible();
      expect(screen.queryByText(/Step \d of/)).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent(
        local
          ? "Jamie is now the owner."
          : "jamie@example.com is now the owner.",
      );
      expect(onTransferred).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      await click(screen.getByRole("button", { name: "Done" }));
      expect(onTransferred).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(adapter.transferCloud).toHaveBeenCalledOnce();
      expect(adapter.cancel).not.toHaveBeenCalled();
    },
  );

  it("searches by email only and uses the typed invitation address without sending on entry", async () => {
    adapter.selectCloud = vi.fn();
    vi.mocked(adapter.prepare).mockResolvedValue(
      choosing(
        Array.from({ length: 8 }, (_, index) => ({
          id: index + 10,
          name: "Display " + index,
          email: "member" + index + "@example.com",
        })),
      ),
    );
    show();
    const input = await screen.findByRole("combobox", {
      name: "Stirling account",
    });
    fireEvent.focus(input);
    expect(await screen.findAllByRole("option")).toHaveLength(8);
    fireEvent.change(input, { target: { value: "member7@" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(
      screen.getByRole("option", { name: "member7@example.com" }),
    ).toBeVisible();
    fireEvent.change(input, { target: { value: "Display" } });
    expect(screen.queryByRole("option")).toBeNull();
    fireEvent.change(input, { target: { value: "new@example.com" } });
    expect(
      screen.getByRole("button", { name: "Send invitation" }),
    ).toBeEnabled();
    expect(screen.getByText("new@example.com")).toBeVisible();
    expect(adapter.selectCloud).not.toHaveBeenCalled();
    expect(adapter.invite).not.toHaveBeenCalled();
  });

  it("does not send an invitation if the entered address is already a member when checked", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(choosing([]));
    adapter.selectCloud = vi.fn().mockResolvedValue({
      ...status("READY"),
      cloudEmail: "joined@example.com",
    });
    show();
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Stirling account" }),
      {
        target: { value: "joined@example.com" },
      },
    );
    await click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
    expect(adapter.invite).not.toHaveBeenCalled();
    expect(adapter.transferCloud).not.toHaveBeenCalled();
  });

  it("does not advance a changed email if cancelling the previous selection fails", async () => {
    adapter.selectCloud = vi.fn();
    vi.mocked(adapter.cancel!).mockRejectedValue(new Error("network"));
    show();
    const input = await screen.findByRole("combobox", {
      name: "Stirling account",
    });
    fireEvent.change(input, { target: { value: "other@example.com" } });
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Send invitation" }),
    ).toBeNull();
    expect(adapter.selectCloud).not.toHaveBeenCalled();
    expect(adapter.invite).not.toHaveBeenCalled();
    await click(screen.getByRole("button", { name: "Check again" }));
    expect(input).toHaveValue("jamie@example.com");
  });

  it("makes billing details available on keyboard focus", async () => {
    show();
    const details = await screen.findByRole("button", {
      name: "Billing details",
    });
    fireEvent.focus(details);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Billing contact details do not change automatically.",
    );
    expect(screen.getByText(/You keep administrator access/)).toBeVisible();
  });

  it("closing a completed transfer does not cancel it", async () => {
    show();
    await confirm();
    await screen.findByText("Ownership transferred");
    await click(
      await screen.findByRole("button", { name: "Close transfer dialog" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(adapter.cancel).not.toHaveBeenCalled();
  });

  it("does not cancel another recipient's transfer when preparation fails", async () => {
    vi.mocked(adapter.prepare).mockRejectedValue(
      new Error("HANDOVER_IN_PROGRESS"),
    );
    show();
    await click(
      await screen.findByRole("button", { name: "Close transfer dialog" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(adapter.cancel).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "same-team recipient transfers cloud before server (paid=%s)",
    async (paid) => {
      vi.mocked(adapter.prepare).mockResolvedValue(status("READY", paid));
      const order: string[] = [];
      vi.mocked(adapter.transferCloud).mockImplementation(async () => {
        order.push("cloud");
        return status("TRANSFERRED", paid);
      });
      vi.mocked(adapter.completeLocal!).mockImplementation(async () => {
        order.push("server");
      });
      show();
      expect(await screen.findByRole("checkbox")).not.toBeChecked();
      expect(
        screen.getByRole("button", { name: "Transfer ownership" }),
      ).toBeDisabled();
      await confirm();
      await screen.findByText("Ownership transferred");
      expect(order).toEqual(["cloud", "server"]);
      expect(screen.getByText("Ownership transferred")).toBeInTheDocument();
    },
  );

  it.each([
    [false, "no account"],
    [false, "another team"],
    [true, "no account"],
    [true, "another team"],
  ])("requires acceptance: paid=%s, recipient=%s", async (paid) => {
    vi.mocked(adapter.prepare).mockResolvedValue(
      status("NEEDS_MEMBERSHIP", Boolean(paid)),
    );
    show();
    await click(await screen.findByRole("button", { name: "Send invitation" }));
    await screen.findByText("Invitation sent");
    expect(
      screen.queryByRole("button", { name: "Transfer ownership" }),
    ).not.toBeInTheDocument();
    expect(adapter.completeLocal).not.toHaveBeenCalled();
    vi.mocked(adapter.prepare).mockResolvedValue(
      status("READY", Boolean(paid)),
    );
    await click(screen.getByRole("button", { name: "Check again" }));
    await confirm();
    await screen.findByText("Ownership transferred");
  });

  it("cloud failure leaves server ownership untouched", async () => {
    vi.mocked(adapter.transferCloud).mockRejectedValue({
      body: { detail: "CLOUD_OWNER_REQUIRED" },
    });
    show();
    await confirm();
    await screen.findByText(
      "Sign in as the current cloud team owner, then try this step again.",
    );
    expect(adapter.completeLocal).not.toHaveBeenCalled();
    expect(onTransferred).not.toHaveBeenCalled();
  });

  it("resumes a cloud commit after a lost response without transferring cloud twice", async () => {
    vi.mocked(adapter.transferCloud).mockRejectedValue(new Error("network"));
    vi.mocked(adapter.prepare)
      .mockResolvedValueOnce(status("READY"))
      .mockResolvedValue(status("TRANSFERRED"));
    show();
    await confirm();
    await click(
      await screen.findByRole("button", { name: "Finish server transfer" }),
    );
    await screen.findByText("Ownership transferred");
    expect(adapter.transferCloud).toHaveBeenCalledOnce();
    expect(adapter.completeLocal).toHaveBeenCalledOnce();
  });

  it.each([
    ["TARGET_UNAVAILABLE", "Restore the selected server user's access"],
    ["TARGET_CHANGED", "Restore the selected server user's access"],
    ["LINK_CHANGED", "The server's cloud link changed"],
  ])(
    "shows the repair needed after the cloud step: %s",
    async (code, message) => {
      vi.mocked(adapter.prepare).mockResolvedValue(status("TRANSFERRED"));
      vi.mocked(adapter.completeLocal!).mockRejectedValue(new Error(code));
      show();
      await click(
        await screen.findByRole("button", { name: "Finish server transfer" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(adapter.cancel).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "Cancel transfer" }),
      ).toBeNull();
      expect(adapter.transferCloud).not.toHaveBeenCalled();
    },
  );

  it("reopening a partial handover offers completion and prevents cancellation", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(status("TRANSFERRED"));
    show();
    const finish = await screen.findByRole("button", {
      name: "Finish server transfer",
    });
    expect(
      screen.queryByRole("button", { name: "Cancel transfer" }),
    ).not.toBeInTheDocument();
    await click(finish);
    await screen.findByText("Ownership transferred");
    expect(adapter.transferCloud).not.toHaveBeenCalled();
  });

  it("native SaaS uses the same review without a server mutation", async () => {
    adapter.local = false;
    const unlinked = status("READY");
    unlinked.cloud!.linkedInstances = 0;
    vi.mocked(adapter.prepare).mockResolvedValue(unlinked);
    show();
    expect(await screen.findByText("New owner")).toBeVisible();
    expect(screen.getAllByText("jamie@example.com")[0]).toBeVisible();
    expect(screen.queryByText("Stirling account")).toBeNull();
    expect(
      screen.getByText("You'll become a team member and lose owner access."),
    ).toBeVisible();
    await confirm();
    await screen.findByText("Ownership transferred");
    expect(adapter.transferCloud).toHaveBeenCalledOnce();
    expect(adapter.completeLocal).not.toHaveBeenCalled();
  });

  it.each([1, 3])(
    "directs SaaS owners with %s linked servers to self-hosted",
    async (count) => {
      adapter.local = false;
      const linked = status("READY");
      linked.cloud!.linkedInstances = count;
      vi.mocked(adapter.prepare).mockResolvedValue(linked);
      show();
      expect(
        await screen.findByText("Start from your self-hosted server"),
      ).toBeVisible();
      expect(screen.getByText(/open Settings → Users/)).toBeVisible();
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Transfer ownership" }),
      ).toBeNull();
      await click(
        screen.getByRole("button", { name: "Close transfer dialog" }),
      );
      expect(onClose).toHaveBeenCalledOnce();
      expect(adapter.transferCloud).not.toHaveBeenCalled();
      expect(adapter.completeLocal).not.toHaveBeenCalled();
    },
  );

  it("shows the same guidance if an instance is linked after the review loads", async () => {
    adapter.local = false;
    const unlinked = status("READY");
    unlinked.cloud!.linkedInstances = 0;
    vi.mocked(adapter.prepare).mockResolvedValue(unlinked);
    vi.mocked(adapter.transferCloud).mockRejectedValue({
      response: { data: { detail: "START_TRANSFER_FROM_INSTANCE" } },
    });
    show();
    await confirm();
    expect(
      await screen.findByText("Start from your self-hosted server"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Transfer ownership" }),
    ).toBeNull();
    expect(onTransferred).not.toHaveBeenCalled();
    expect(adapter.completeLocal).not.toHaveBeenCalled();
  });
});
