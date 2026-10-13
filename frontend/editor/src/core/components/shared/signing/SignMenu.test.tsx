import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SignMenu } from "@app/components/shared/signing/SignMenu";
import {
  collectSigningItems,
  type SigningMenuItem,
} from "@app/utils/signingItems";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const incoming: SigningMenuItem = {
  kind: "request",
  sessionId: "incoming",
  documentName: "Contract.pdf",
  ownerUsername: "Alice",
  createdAt: "2026-09-24",
  dueDate: "",
  myStatus: "PENDING",
  unread: true,
};
const owned: SigningMenuItem = {
  kind: "session",
  sessionId: "owned",
  documentName: "Owned.pdf",
  createdAt: "2026-09-24",
  participantCount: 2,
  signedCount: 1,
  finalized: false,
  unread: true,
};
function setup(items: SigningMenuItem[] = [], sharedSign?: string) {
  const onSelect = vi.fn();
  const onOpenSigning = vi.fn();
  const onClose = vi.fn();
  const menu = (rows: SigningMenuItem[]) => (
    <SignMenu
      opened
      onClose={onClose}
      onSelect={onSelect}
      onOpenSigning={onOpenSigning}
      reasons={{ sharedSign }}
      items={rows}
    >
      <button>Sign</button>
    </SignMenu>
  );
  const view = render(menu(items));
  return {
    ...view,
    onSelect,
    onOpenSigning,
    onClose,
    updateItems: (rows: SigningMenuItem[]) => view.rerender(menu(rows)),
  };
}

it("shows one owner session in the popover as its action changes from signing to finalization", () => {
  const request = { ...incoming, sessionId: owned.sessionId };
  const rows = collectSigningItems([request], [owned]).map((item) => ({
    ...item,
    unread: true,
  }));
  const { onOpenSigning, updateItems } = setup(rows);
  const active = within(screen.getByRole("region", { name: "Active" }));
  expect(active.getAllByRole("button")).toHaveLength(1);
  fireEvent.click(
    active.getByRole("button", { name: /Owned.pdf.*Needs your signature/ }),
  );
  expect(onOpenSigning).toHaveBeenCalledWith({
    kind: "session",
    sessionId: "owned",
  });
  expect(
    screen.getByRole("button", { name: /^Unread\s*1$/ }),
  ).toBeInTheDocument();
  updateItems(
    collectSigningItems(
      [{ ...request, myStatus: "SIGNED" }],
      [{ ...owned, signedCount: 2 }],
    ).map((item) => ({ ...item, unread: false })),
  );
  expect(active.getAllByRole("button")).toHaveLength(1);
  expect(
    active.getByRole("button", { name: /Owned.pdf.*Ready to finalize/ }),
  ).toBeInTheDocument();
});

it("filters unread invitations and ready owner sessions, updating the count when read", () => {
  const items: SigningMenuItem[] = [
    incoming,
    { ...owned, signedCount: 2 },
    { ...incoming, sessionId: "read", documentName: "Read.pdf", unread: false },
    {
      ...owned,
      sessionId: "closed",
      documentName: "Closed.pdf",
      finalized: true,
    },
  ];
  const { updateItems, onOpenSigning } = setup(items);
  fireEvent.click(screen.getByRole("button", { name: /^Unread\s*2$/ }));
  const list = within(screen.getByRole("region", { name: "Unread" }));
  expect(list.getAllByRole("button")).toHaveLength(2);
  expect(
    list.getByRole("button", { name: /Owned.pdf.*Ready to finalize/ }),
  ).toBeInTheDocument();
  expect(
    list.queryByRole("button", { name: /Read.pdf|Closed.pdf/ }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Owned" },
  });
  expect(list.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /^Unread\s*2$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(onOpenSigning).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  updateItems(items.map((item) => ({ ...item, unread: false })));
  expect(screen.getByRole("button", { name: /^Unread\s*0$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Active" }));
  expect(
    screen.getByRole("button", { name: /Owned.pdf.*Ready to finalize/ }),
  ).toBeInTheDocument();
});

it("keeps personal signing accessible when shared signing is disabled", () => {
  const { onSelect } = setup([], "Disabled on this server");
  expect(screen.getByRole("dialog", { name: "Sign" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Request signatures" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Personal signature/ }));
  expect(onSelect).toHaveBeenCalledWith("sign");
});

it("keeps expired and server-closed requests out of Active and the unread count", () => {
  setup([
    { ...incoming, closed: true, documentName: "Viewer.pdf" },
    {
      ...incoming,
      sessionId: "expired",
      accessExpired: true,
      documentName: "Expired.pdf",
    },
  ]);
  expect(
    screen.getByRole("button", { name: /^Unread\s*0$/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Viewer.pdf|Expired.pdf/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Completed" }));
  expect(
    screen.getByRole("button", { name: /Viewer.pdf.*Closed/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Expired.pdf.*Access expired/ }),
  ).toBeInTheDocument();
});

it("opens request creation, expanded sessions and certificate signing directly", () => {
  const { onSelect, onOpenSigning, onClose } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Request signatures" }));
  expect(onOpenSigning).toHaveBeenLastCalledWith("create");
  fireEvent.click(
    screen.getByRole("button", { name: "Expand signing sessions" }),
  );
  expect(onOpenSigning).toHaveBeenLastCalledWith("list");
  fireEvent.click(screen.getByRole("button", { name: /Digital signature/ }));
  expect(onSelect).toHaveBeenCalledWith("certSign");
  expect(onClose).toHaveBeenCalledTimes(3);
});

it("shows requests and owned sessions together, with unread dots independent of readiness", () => {
  setup([
    incoming,
    owned,
    {
      ...owned,
      sessionId: "ready",
      documentName: "Ready.pdf",
      signedCount: 2,
      unread: false,
    },
    {
      ...owned,
      sessionId: "waiting",
      documentName: "Waiting.pdf",
      signedCount: 0,
      unread: false,
    },
  ]);
  expect(
    screen.queryByRole("button", { name: /Needs action/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const list = within(screen.getByRole("region", { name: "Active" }));
  expect(list.getAllByRole("button")).toHaveLength(4);
  expect(list.getAllByRole("img", { name: /New activity/ })).toHaveLength(2);
  const ready = list.getByRole("button", {
    name: /Ready.pdf.*Ready to finalize/,
  });
  expect(ready).toBeInTheDocument();
  expect(
    within(ready).queryByRole("img", { name: /New activity/ }),
  ).not.toBeInTheDocument();
  expect(list.getByRole("button", { name: /Waiting.pdf/ })).toBeInTheDocument();
});
it("opens the selected role by identity and closes the popover", () => {
  const { onOpenSigning, onSelect, onClose } = setup([incoming]);
  fireEvent.click(
    screen.getByRole("button", { name: /Contract.pdf.*Needs your signature/ }),
  );
  expect(onOpenSigning).toHaveBeenCalledWith({
    kind: "request",
    sessionId: "incoming",
  });
  expect(onSelect).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("includes a newly finalized document in Unread and Completed, but never Active", () => {
  const completed: SigningMenuItem = {
    ...incoming,
    finalized: true,
    closed: true,
    myStatus: "SIGNED",
  };
  const { updateItems } = setup([completed]);
  expect(
    screen.queryByRole("button", { name: /Contract.pdf.*Finalized/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Unread\s*1$/ }));
  expect(
    screen.getByRole("button", { name: /Contract.pdf.*Finalized/ }),
  ).toBeInTheDocument();
  updateItems([{ ...completed, unread: false }]);
  expect(
    screen.queryByRole("button", { name: /Contract.pdf.*Finalized/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Completed" }));
  expect(
    screen.getByRole("button", { name: /Contract.pdf.*Finalized/ }),
  ).toBeInTheDocument();
});

it("shows every active item and searches without marking hidden items as read", () => {
  const requests = Array.from({ length: 9 }, (_, index) => ({
    ...incoming,
    sessionId: `request-${index}`,
    documentName: `Document ${index}.pdf`,
  }));
  setup([...requests, { ...owned, unread: false }]);
  fireEvent.click(screen.getByRole("button", { name: "Active" }));
  expect(
    within(screen.getByRole("region", { name: "Active" })).getAllByRole(
      "button",
    ),
  ).toHaveLength(10);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Document 8" },
  });
  expect(
    screen.getByRole("button", { name: /Document 8.pdf/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Document 0.pdf/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: /New activity/ })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "alice" },
  });
  expect(
    within(screen.getByRole("region", { name: "Active" })).getAllByRole(
      "button",
    ),
  ).toHaveLength(9);
});

it("keeps submitted requests active and places finalized or declined requests in Completed", () => {
  setup([
    {
      ...incoming,
      documentName: "Submitted.pdf",
      myStatus: "SIGNED",
      unread: false,
    },
    { ...owned, finalized: true, unread: false },
    {
      ...incoming,
      sessionId: "declined",
      documentName: "Declined.pdf",
      myStatus: "DECLINED",
      unread: false,
    },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Active" }));
  expect(
    screen.getByRole("button", { name: /Submitted.pdf.*Submitted/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Declined.pdf/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Completed" }));
  expect(
    screen.getByRole("button", { name: /Owned.pdf.*Finalized/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Declined.pdf.*Declined/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Submitted.pdf/ }),
  ).not.toBeInTheDocument();
});

it("allows editing search with Home/End and restores the trigger on Escape", () => {
  const { onClose } = setup([incoming]);
  const search = screen.getByRole("searchbox");
  search.focus();
  fireEvent.keyDown(search, { key: "Home" });
  expect(search).toHaveFocus();
  fireEvent.keyDown(search, { key: "End" });
  expect(search).toHaveFocus();
  fireEvent.keyDown(search, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Sign" })).toHaveFocus();
});
