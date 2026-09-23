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
      <MantineProvider>
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
    members = [{ id: 42, name: "Jamie Cloud", email: "cloud@example.com" }],
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
    expect(
      await screen.findByText("Choose their Stirling account"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await click(screen.getByRole("radio", { name: /Jamie Cloud/ }));
    await click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("checkbox");
    expect(adapter.selectCloud).toHaveBeenCalledWith({ cloudUserId: 42 });
    expect(screen.getByText("Server account")).toBeVisible();
    expect(screen.getAllByText("Jamie")[0]).toBeVisible();
    expect(screen.getByText("cloud@example.com")).toBeVisible();
    expect(adapter.transferCloud).not.toHaveBeenCalled();
    await confirm();
    expect(screen.getByText("Ownership transferred")).toBeVisible();
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
    expect(await screen.findByText("Invite your next owner")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    await click(screen.getByRole("button", { name: "Invite new owner" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Their email address" }),
      { target: { value: "invalid" } },
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Their email address" }),
      { target: { value: "new@example.com" } },
    );
    await click(screen.getByRole("button", { name: "Continue" }));
    await click(await screen.findByRole("button", { name: "Send invitation" }));
    expect(adapter.selectCloud).toHaveBeenCalledWith({
      cloudEmail: "new@example.com",
    });
    expect(await screen.findByText("Waiting for them to join")).toBeVisible();
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
    await click(await screen.findByRole("radio", { name: /Jamie Cloud/ }));
    await click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose another cloud member",
    );
    expect(adapter.transferCloud).not.toHaveBeenCalled();
    expect(adapter.completeLocal).not.toHaveBeenCalled();
  });

  it("changing the selected account cancels its draft before loading the member picker", async () => {
    adapter.selectCloud = vi.fn();
    show();
    await screen.findByRole("checkbox");
    vi.mocked(adapter.prepare).mockResolvedValue(choosing());
    await click(screen.getByRole("button", { name: "Change" }));
    expect(
      await screen.findByText("Choose their Stirling account"),
    ).toBeVisible();
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

  it("keeps the dialog open if the server refuses cancellation", async () => {
    vi.mocked(adapter.cancel!).mockRejectedValue(
      new Error("Cloud state unknown"),
    );
    show();
    await click(
      await screen.findByRole("button", { name: "Close transfer dialog" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't complete this step",
    );
    expect(onClose).not.toHaveBeenCalled();
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
      expect(
        screen.getByText(local ? "Step 3 of 3" : "Step 2 of 2"),
      ).toBeVisible();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Jamie is now the owner.",
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

  it("searches a larger team and opens invitation entry without sending an invitation", async () => {
    vi.mocked(adapter.prepare).mockResolvedValue(
      choosing(
        Array.from({ length: 8 }, (_, index) => ({
          id: index + 10,
          name: "Member " + (index + 1),
          email: "member" + (index + 1) + "@example.com",
        })),
      ),
    );
    show();
    expect(await screen.findAllByRole("radio")).toHaveLength(8);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "member8@" },
    });
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /Member 8/ })).toBeVisible();
    await click(screen.getByRole("button", { name: "Invite" }));
    expect(
      screen.getByRole("textbox", { name: "Their email address" }),
    ).toBeVisible();
    expect(adapter.invite).not.toHaveBeenCalled();
    expect(adapter.transferCloud).not.toHaveBeenCalled();
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
    await screen.findByText(
      "Invitation sent. Ask them to accept it, then check again.",
    );
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
      await click(screen.getByRole("button", { name: "Close" }));
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
