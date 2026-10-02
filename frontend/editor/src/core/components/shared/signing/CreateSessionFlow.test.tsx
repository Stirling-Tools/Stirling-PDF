import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { CreateSessionFlow } from "@app/components/shared/signing/CreateSessionFlow";
import UserSelector from "@app/components/shared/UserSelector";
import { qk } from "@app/query/keys";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@app/hooks/useIsMobile", () => ({
  useIsMobile: () => viewport.mobile,
}));
beforeEach(() => {
  viewport.mobile = false;
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en-US" },
    t: (key: string, fallback?: string, values?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(\w+)}}/g, (_, name) =>
        String(values?.[name] ?? name),
      ),
  }),
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: { id: "1" } }),
}));
vi.mock("@app/api/users", () => ({ fetchUsers: vi.fn() }));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

const users = [
  {
    userId: 1,
    username: "owner",
    displayName: "Owner",
    teamName: "Sales",
    enabled: true,
  },
  {
    userId: 2,
    username: "bob",
    displayName: "Bob",
    teamName: "Sales",
    enabled: true,
  },
  {
    userId: 3,
    username: "alice",
    displayName: "Alice",
    teamName: "Legal",
    enabled: true,
  },
  {
    userId: 4,
    username: "internal",
    displayName: "Internal",
    teamName: "Internal",
    enabled: true,
  },
];

function Harness({
  onSubmit,
  creating = false,
  initialIds = [],
  initialFileSelected = true,
}: {
  onSubmit: ReturnType<typeof vi.fn>;
  creating?: boolean;
  initialIds?: number[];
  initialFileSelected?: boolean;
}) {
  const [ids, setIds] = useState(initialIds);
  const [date, setDate] = useState("2026-10-01");
  const [hasFile, setHasFile] = useState(initialFileSelected);
  return (
    <>
      <output aria-label="Date sent to API">{date}</output>
      <output aria-label="Selected participant IDs">{ids.join(",")}</output>
      <CreateSessionFlow
        documentPicker={
          <button disabled={creating} onClick={() => setHasFile(!hasFile)}>
            {hasFile ? "Change PDF" : "Choose PDF"}
          </button>
        }
        selectedFiles={hasFile ? [{ name: "Document.pdf", size: 100 }] : []}
        selectedUserIds={ids}
        onSelectedUserIdsChange={setIds}
        dueDate={date}
        onDueDateChange={setDate}
        creating={creating}
        onSubmit={onSubmit}
      />
    </>
  );
}

function show({
  creating = false,
  initialIds = [],
  mobile = false,
  initialFileSelected = true,
  availableUsers = users,
}: {
  creating?: boolean;
  initialIds?: number[];
  mobile?: boolean;
  initialFileSelected?: boolean;
  availableUsers?: typeof users;
} = {}) {
  viewport.mobile = mobile;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(qk.users(), availableUsers);
  const onSubmit = vi.fn();
  const content = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MantineProvider env="test">
          <Harness
            onSubmit={onSubmit}
            creating={creating}
            initialIds={initialIds}
            initialFileSelected={initialFileSelected}
          />
        </MantineProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(content());
  return {
    onSubmit,
    user: userEvent.setup(),
    resize: (mobile: boolean) => {
      viewport.mobile = mobile;
      view.rerender(content());
    },
  };
}

it("guides mobile creation through three pages and retains the draft when going back", async () => {
  const { user, onSubmit } = show({ mobile: true, initialFileSelected: false });
  expect(
    screen.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Participants", exact: true }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Send signing request" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Choose PDF" }));
  await user.click(screen.getByRole("button", { name: "Next", exact: true }));
  expect(
    screen.getByRole("button", { name: "Participants", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  expect(
    screen.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Change PDF" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Clear date" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: /Bob/ }));
  await user.click(screen.getByRole("button", { name: "Next", exact: true }));
  expect(
    screen.getByRole("button", { name: "Dates & options" }),
  ).toHaveAttribute("aria-current", "step");
  await user.click(
    screen.getByRole("button", { name: "Sunday, October 25, 2026" }),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Appearance and summary page (optional)",
    }),
  );
  await user.click(
    await screen.findByRole("switch", {
      name: "Include Signature Summary Page",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  expect(screen.getByRole("checkbox", { name: /Bob/ })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Back", exact: true }));
  await user.click(screen.getByRole("button", { name: "Change PDF" }));
  expect(
    screen.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Choose PDF" }));
  await user.click(screen.getByRole("button", { name: "Next", exact: true }));
  expect(screen.getByRole("checkbox", { name: /Bob/ })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next", exact: true }));
  expect(screen.getByLabelText("Date sent to API")).toHaveTextContent(
    "2026-10-25",
  );
  expect(
    screen.getByRole("switch", { name: "Include Signature Summary Page" }),
  ).toBeChecked();
  expect(onSubmit).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Send signing request" }),
  );
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ includeSummaryPage: true }),
  );
});

it("preserves the mobile page and signature settings across desktop resizing", async () => {
  const { user, resize } = show({ mobile: true, initialIds: [2] });
  await user.click(screen.getByRole("button", { name: "Dates & options" }));
  await user.click(
    screen.getByRole("button", {
      name: "Appearance and summary page (optional)",
    }),
  );
  await user.click(
    await screen.findByRole("switch", {
      name: "Include Signature Summary Page",
    }),
  );
  resize(false);
  expect(screen.getByRole("button", { name: "Change PDF" })).toBeVisible();
  expect(screen.getByRole("checkbox", { name: /Bob/ })).toBeChecked();
  expect(
    screen.getByRole("switch", { name: "Include Signature Summary Page" }),
  ).toBeChecked();
  resize(true);
  expect(
    screen.getByRole("button", { name: "Dates & options" }),
  ).toHaveAttribute("aria-current", "step");
  expect(
    screen.getByRole("switch", { name: "Include Signature Summary Page" }),
  ).toBeChecked();
  expect(
    screen.queryByRole("button", { name: "Change PDF" }),
  ).not.toBeInTheDocument();
});

it("locks mobile navigation during submission", () => {
  show({ mobile: true, creating: true, initialIds: [2] });
  for (const label of ["Document", "Participants", "Dates & options", "Next"]) {
    expect(
      screen.getByRole("button", { name: label, exact: true }),
    ).toBeDisabled();
  }
});

it("selects participants inline, retaining checked people while searching", async () => {
  const { user } = show();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  expect(
    screen.queryByRole("checkbox", { name: /Internal/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Send signing request" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: /Bob/ }));
  expect(
    screen.getByRole("button", { name: "Send signing request" }),
  ).toBeEnabled();
  const search = screen.getByRole("textbox", {
    name: "Search people or teams",
  });
  await user.type(search, "legal");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  await user.click(screen.getByRole("checkbox", { name: /Alice/ }));
  expect(screen.getByText("2 selected")).toHaveAttribute("role", "status");
  await user.clear(search);
  expect(screen.getByRole("checkbox", { name: /Bob/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Alice/ })).toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: /Bob/ }));
  await user.click(screen.getByRole("checkbox", { name: /Alice/ }));
  expect(
    screen.getByRole("button", { name: "Send signing request" }),
  ).toBeDisabled();
});
it.each([{ availableUsers: users }, { availableUsers: [users[0]] }])(
  "allows the owner as the only signer, including a directory scoped to their own account",
  async ({ availableUsers }) => {
    const { user, onSubmit } = show({ availableUsers });
    const self = screen.getByRole("checkbox", { name: "Owner (@owner) (You)" });
    await user.click(self);
    expect(screen.getByLabelText("Selected participant IDs")).toHaveTextContent(
      "1",
    );
    await user.click(
      screen.getByRole("button", { name: "Send signing request" }),
    );
    expect(onSubmit).toHaveBeenCalledOnce();
    await user.click(self);
    expect(
      screen.getByRole("button", { name: "Send signing request" }),
    ).toBeDisabled();
  },
);

it("keeps the owner selected while adding other participants", async () => {
  const { user } = show();
  await user.click(
    screen.getByRole("checkbox", { name: "Owner (@owner) (You)" }),
  );
  await user.click(screen.getByRole("checkbox", { name: /Bob/ }));
  expect(screen.getByLabelText("Selected participant IDs")).toHaveTextContent(
    "1,2",
  );
});
it("round-trips calendar dates without timezone conversion and allows clearing the deadline", async () => {
  const { user } = show();
  await user.click(
    screen.getByRole("button", { name: "Sunday, October 25, 2026" }),
  );
  expect(screen.getByLabelText("Date sent to API")).toHaveTextContent(
    "2026-10-25",
  );
  await user.click(screen.getByRole("button", { name: "Clear date" }));
  expect(screen.getByLabelText("Date sent to API")).toBeEmptyDOMElement();
  expect(screen.getByText("No due date")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next month" }));
  expect(screen.getByText("November 2026")).toBeInTheDocument();
});

it("moves signing guidance into focusable tooltips while preserving submitted signature settings", async () => {
  const { user, onSubmit } = show({ initialIds: [2] });
  expect(
    screen.queryByText(/^Participants can sign in any order/),
  ).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole("button", { name: "About signing order" }));
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "Participants can sign in any order",
  );
  fireEvent.blur(screen.getByRole("button", { name: "About signing order" }));
  await user.click(
    screen.getByRole("button", {
      name: "Appearance and summary page (optional)",
    }),
  );
  expect(screen.queryByText(/^A summary page will/)).not.toBeInTheDocument();
  fireEvent.focus(
    await screen.findByRole("button", {
      name: "Include Signature Summary Page",
    }),
  );
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "wet signatures are unaffected",
  );
  fireEvent.blur(
    screen.getByRole("button", { name: "Include Signature Summary Page" }),
  );
  await user.click(
    screen.getByRole("switch", { name: "Include Signature Summary Page" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Send signing request" }),
  );
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ includeSummaryPage: true, showSignature: false }),
  );
});

it("locks participants, dates and sending while creation is in progress", () => {
  show({ creating: true, initialIds: [2] });
  expect(
    screen.getByRole("textbox", { name: "Search people or teams" }),
  ).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: /Bob/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Clear date" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Sunday, October 25, 2026" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Send signing request" }),
  ).toBeDisabled();
});

it("preserves the existing dropdown selector for other callers", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(qk.users(), users);
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MantineProvider env="test">
          <UserSelector label="Recipients" value={[2]} onChange={onChange} />
        </MantineProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("textbox", { name: "Recipients" }));
  expect(
    screen.queryByRole("option", { name: /Internal/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: /Alice/ }));
  expect(onChange).toHaveBeenCalledWith([2, 3]);
  await user.click(
    screen.getByRole("option", { name: "Owner (@owner) (You)" }),
  );
  expect(onChange).toHaveBeenLastCalledWith([2, 1]);
});
