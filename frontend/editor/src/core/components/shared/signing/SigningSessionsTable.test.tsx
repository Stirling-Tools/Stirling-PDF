import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SigningSessionsTable } from "@app/components/shared/signing/SigningSessionsTable";
import type { SigningItem } from "@app/utils/signingItems";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, values?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(\w+)}}/g, (_, name) =>
        String(values?.[name] ?? name),
      ),
  }),
}));

const items: SigningItem[] = [
  {
    kind: "session",
    sessionId: "shared",
    documentName: "Budget.pdf",
    createdAt: "2026-01-31T10:00:00Z",
    participantCount: 2,
    signedCount: 1,
    finalized: false,
  },
  {
    kind: "request",
    sessionId: "shared",
    documentName: "Budget.pdf",
    ownerUsername: "alice",
    createdAt: "2026-01-31T10:00:00Z",
    dueDate: "2020-05-01",
    myStatus: "SIGNED",
  },
  {
    kind: "request",
    sessionId: "review",
    documentName: "Agreement.pdf",
    ownerUsername: "bob",
    createdAt: "2026-02-01T10:00:00Z",
    dueDate: "2020-04-30",
    myStatus: "VIEWED",
  },
  {
    kind: "request",
    sessionId: "future",
    documentName: "Plan.pdf",
    ownerUsername: "bob",
    createdAt: "2026-01-30T10:00:00Z",
    dueDate: "2099-12-01",
    myStatus: "PENDING",
  },
  {
    kind: "session",
    sessionId: "ready",
    documentName: "Ready.pdf",
    createdAt: "2026-01-29T10:00:00Z",
    participantCount: 2,
    signedCount: 2,
    finalized: false,
  },
  {
    kind: "request",
    sessionId: "done",
    documentName: "Completed.pdf",
    ownerUsername: "alice",
    createdAt: "2026-02-02T10:00:00Z",
    dueDate: "2020-04-30",
    myStatus: "SIGNED",
    finalized: true,
  },
  {
    kind: "request",
    sessionId: "declined",
    documentName: "Declined.pdf",
    ownerUsername: "alice",
    createdAt: "2026-01-28T10:00:00Z",
    dueDate: "",
    myStatus: "DECLINED",
  },
];

function show(loading = false, rows = items) {
  const onOpen = vi.fn();
  const onRefresh = vi.fn();
  render(
    <MantineProvider>
      <SigningSessionsTable
        items={rows}
        loading={loading}
        onOpen={onOpen}
        onRefresh={onRefresh}
      />
    </MantineProvider>,
  );
  return { user: userEvent.setup(), onOpen, onRefresh };
}

function documents() {
  return within(screen.getByRole("table"))
    .queryAllByRole("button")
    .filter((element) => element.tagName === "TR")
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

async function pick(
  user: ReturnType<typeof userEvent.setup>,
  facet: string,
  option: string,
) {
  await user.click(
    screen.getByRole("button", { name: facet, expanded: false }),
  );
  await user.click(
    screen.getByRole("menuitemcheckbox", { name: new RegExp(option) }),
  );
  await user.keyboard("{Escape}");
}

it("sorts document names and actual timestamps, keeping undated sessions last", async () => {
  const { user } = show();
  expect(documents()[0]).toBe("Agreement.pdf");
  await user.click(
    within(screen.getByRole("columnheader", { name: "Document" })).getByRole(
      "button",
    ),
  );
  expect(documents()).toEqual([
    "Agreement.pdf",
    "Budget.pdf",
    "Budget.pdf",
    "Declined.pdf",
    "Plan.pdf",
    "Ready.pdf",
  ]);
  const due = within(
    screen.getByRole("columnheader", { name: "Due date" }),
  ).getByRole("button");
  await user.click(due);
  if (
    screen
      .getByRole("columnheader", { name: "Due date" })
      .getAttribute("aria-sort") !== "ascending"
  )
    await user.click(due);
  expect(documents()).toEqual([
    "Agreement.pdf",
    "Budget.pdf",
    "Plan.pdf",
    "Budget.pdf",
    "Ready.pdf",
    "Declined.pdf",
  ]);
  await user.click(due);
  if (
    screen
      .getByRole("columnheader", { name: "Due date" })
      .getAttribute("aria-sort") === "none"
  )
    await user.click(due);
  expect(documents().slice(0, 3)).toEqual([
    "Plan.pdf",
    "Budget.pdf",
    "Agreement.pdf",
  ]);
});

it("combines owner, status and due-date facets with search, and clears filters", async () => {
  const { user } = show();
  await pick(user, "Owner", "bob");
  await pick(user, "Status", "Needs your signature");
  await pick(user, "Due date", "Overdue");
  expect(documents()).toEqual(["Agreement.pdf"]);
  await user.type(
    screen.getByRole("textbox", { name: "Search documents or people" }),
    "missing",
  );
  expect(
    screen.getByText("No sessions match your search or filter."),
  ).toBeInTheDocument();
  await user.clear(
    screen.getByRole("textbox", { name: "Search documents or people" }),
  );
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(documents()).toHaveLength(6);
});

it("keeps owner and signer entries distinct and opens the selected role with mouse or keyboard", async () => {
  const { user, onOpen } = show();
  await user.click(
    screen.getByRole("button", { name: /Budget.pdf Created by me/ }),
  );
  expect(onOpen).toHaveBeenLastCalledWith(items[0]);
  fireEvent.keyDown(screen.getByRole("button", { name: /Budget.pdf alice/ }), {
    key: "Enter",
  });
  expect(onOpen).toHaveBeenLastCalledWith(items[1]);
});

it("keeps submitted and declined responses active until finalization, and clears active-only facets on completion", async () => {
  const { user } = show();
  await pick(user, "Status", "Signed");
  expect(documents()).toEqual(["Budget.pdf"]);
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  await pick(user, "Status", "Declined");
  expect(documents()).toEqual(["Declined.pdf"]);
  await user.click(screen.getByRole("radio", { name: "Completed" }));
  expect(documents()).toEqual(["Completed.pdf"]);
  expect(
    screen.queryByRole("button", { name: "Due date", expanded: false }),
  ).not.toBeInTheDocument();
  await pick(user, "Status", "Signed");
  expect(documents()).toEqual(["Completed.pdf"]);
});

it("retains sorting after zero search results and refreshes without clearing the search", async () => {
  const { user, onRefresh } = show();
  await user.click(
    within(screen.getByRole("columnheader", { name: "Document" })).getByRole(
      "button",
    ),
  );
  const search = screen.getByRole("textbox", {
    name: "Search documents or people",
  });
  await user.type(search, "nonexistent");
  await user.clear(search);
  expect(documents()[0]).toBe("Agreement.pdf");
  expect(
    screen.getByRole("columnheader", { name: "Document" }),
  ).toHaveAttribute("aria-sort", "ascending");
  await user.type(search, "ALICE");
  await user.click(screen.getByRole("button", { name: "Refresh sessions" }));
  expect(onRefresh).toHaveBeenCalledOnce();
  expect(documents()).toEqual(["Budget.pdf", "Declined.pdf"]);
});

it("distinguishes initial loading from an empty list", () => {
  show(true, []);
  expect(screen.queryByText("No sessions here yet.")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Refresh sessions" }),
  ).toBeDisabled();
});
