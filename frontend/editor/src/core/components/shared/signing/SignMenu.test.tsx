import { fireEvent, render, screen } from "@testing-library/react";

import { expect, it, vi } from "vitest";
import { SignMenu } from "@app/components/shared/signing/SignMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

it("keeps personal signing accessible when the server disables shared signing", () => {
  const onSelect = vi.fn();
  const onOpenSigning = vi.fn();
  render(
    <>
      <SignMenu
        opened
        onClose={vi.fn()}
        onSelect={onSelect}
        onOpenSigning={onOpenSigning}
        items={[]}
        reasons={{ sharedSign: "Disabled on this server" }}
        badge={0}
      >
        <button>Sign</button>
      </SignMenu>
    </>,
  );
  expect(
    screen.getByRole("menuitem", { name: "Request signatures" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("menuitem", { name: "Draw, type or upload a signature" }),
  );
  expect(onSelect).toHaveBeenCalledWith("sign");
});

it("opens request creation directly and provides a separate sessions entry", () => {
  const onSelect = vi.fn();
  const onOpenSigning = vi.fn();
  render(
    <>
      <SignMenu
        opened
        onClose={vi.fn()}
        onSelect={onSelect}
        onOpenSigning={onOpenSigning}
        items={[]}
        reasons={{}}
        badge={2}
      >
        <button>Sign</button>
      </SignMenu>
    </>,
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Request signatures" }));
  expect(onOpenSigning).toHaveBeenCalledWith("create");
  fireEvent.click(
    screen.getByRole("menuitem", { name: /Expand signing sessions/ }),
  );
  expect(onOpenSigning).toHaveBeenCalledWith("list");
});

it("opens a recent request by identity without selecting a tool", () => {
  const onOpenSigning = vi.fn();
  const onSelect = vi.fn();
  render(
    <SignMenu
      opened
      onClose={vi.fn()}
      onSelect={onSelect}
      onOpenSigning={onOpenSigning}
      reasons={{}}
      badge={1}
      items={[
        {
          kind: "request",
          sessionId: "incoming",
          documentName: "Contract.pdf",
          ownerUsername: "Alice",
          createdAt: "2026-09-24",
          dueDate: "",
          myStatus: "PENDING",
        },
      ]}
    >
      <button>Sign</button>
    </SignMenu>,
  );
  fireEvent.click(
    screen.getByRole("menuitem", { name: /Contract.pdf Needs your signature/ }),
  );
  expect(onOpenSigning).toHaveBeenCalledWith({
    kind: "request",
    sessionId: "incoming",
  });
  expect(onSelect).not.toHaveBeenCalled();
});
