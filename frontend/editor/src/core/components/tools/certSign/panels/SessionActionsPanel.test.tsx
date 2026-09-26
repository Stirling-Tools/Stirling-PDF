import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { SessionActionsPanel } from "@app/components/tools/certSign/panels/SessionActionsPanel";
import type { ParticipantInfo, SessionDetail } from "@app/types/signingSession";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

function participant(
  id: number,
  name: string,
  status: ParticipantInfo["status"],
): ParticipantInfo {
  return {
    id,
    userId: id,
    name,
    email: `${name}@example.test`,
    status,
    lastUpdated: "2026-09-24",
  };
}

function renderSession(participants: ParticipantInfo[], finalized = false) {
  const onFinalize = vi.fn();
  const session: SessionDetail = {
    sessionId: "session",
    documentName: "agreement.pdf",
    ownerEmail: "owner@example.test",
    message: "",
    dueDate: "",
    createdAt: "2026-09-24",
    updatedAt: "2026-09-24",
    finalized,
    participants,
  };
  render(
    <MantineProvider>
      <SessionActionsPanel
        session={session}
        onFinalize={onFinalize}
        onAddParticipants={vi.fn()}
        onLoadSignedPdf={vi.fn()}
        finalizing={false}
        loadingPdf={false}
      />
    </MantineProvider>,
  );
  return onFinalize;
}

describe("signing finalization confirmation", () => {
  it.each([
    { participants: [] },
    { participants: [participant(1, "Alice", "PENDING")] },
  ])(
    "blocks finalization without accepted signatures (%j)",
    ({ participants }) => {
      const onFinalize = renderSession(participants);
      expect(
        screen.getByRole("button", {
          name: "Finalize with Current Signatures",
        }),
      ).toBeDisabled();
      expect(onFinalize).not.toHaveBeenCalled();
    },
  );

  it("lists included and excluded participants before the owner commits", () => {
    const onFinalize = renderSession([
      participant(1, "Alice", "SIGNED"),
      participant(2, "Bob", "PENDING"),
      participant(3, "Carol", "DECLINED"),
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Finalize with Current Signatures" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Alice")).toBeInTheDocument();
    expect(dialog.getByText("Bob — Pending")).toBeInTheDocument();
    expect(dialog.getByText("Carol — Declined")).toBeInTheDocument();
    expect(onFinalize).not.toHaveBeenCalled();
    fireEvent.click(
      dialog.getByRole("button", { name: "Confirm and finalize" }),
    );
    expect(onFinalize).toHaveBeenCalledTimes(1);
  });

  it("allows cancelling without finalizing", () => {
    const onFinalize = renderSession([participant(1, "Alice", "SIGNED")]);
    fireEvent.click(
      screen.getByRole("button", { name: "Finalize and Load Signed PDF" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onFinalize).not.toHaveBeenCalled();
  });

  it("offers the final PDF after the session closes", () => {
    renderSession([participant(1, "Alice", "SIGNED")], true);
    expect(
      screen.getByRole("button", { name: "Load Signed PDF into Active Files" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Finalize/ }),
    ).not.toBeInTheDocument();
  });
});
