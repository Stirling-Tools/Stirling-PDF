import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { CreateSessionFlow } from "@app/components/shared/signing/CreateSessionFlow";
import UserSelector from "@app/components/shared/UserSelector";
import { qk } from "@app/query/keys";

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
}: {
  onSubmit: ReturnType<typeof vi.fn>;
  creating?: boolean;
  initialIds?: number[];
}) {
  const [ids, setIds] = useState(initialIds);
  const [date, setDate] = useState("2026-10-01");
  return (
    <>
      <output aria-label="Date sent to API">{date}</output>
      <CreateSessionFlow
        selectedFiles={[{ name: "Document.pdf", size: 100 }]}
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
}: { creating?: boolean; initialIds?: number[] } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(qk.users(), users);
  const onSubmit = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MantineProvider env="test">
          <Harness
            onSubmit={onSubmit}
            creating={creating}
            initialIds={initialIds}
          />
        </MantineProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSubmit, user: userEvent.setup() };
}

it("selects participants inline, retaining checked people while searching", async () => {
  const { user } = show();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  expect(
    screen.queryByRole("checkbox", { name: /Owner|Internal/ }),
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
    screen.queryByRole("option", { name: /Owner|Internal/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: /Alice/ }));
  expect(onChange).toHaveBeenCalledWith([2, 3]);
});
