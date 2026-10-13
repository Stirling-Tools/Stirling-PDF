import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UserSelector from "@app/components/shared/UserSelector";
import { fetchUsers } from "@app/api/users";
import { qk } from "@app/query/keys";

const auth = vi.hoisted(() => ({
  isAdmin: true,
  isTeamLeader: false,
  isAnonymous: false,
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ ...auth, loading: false, user: { id: "1" } }),
}));
vi.mock("@app/contexts/SaaSTeamContext", () => ({ useSaaSTeam: () => auth }));
vi.mock("@app/api/users", () => ({ fetchUsers: vi.fn() }));
vi.mock("@portal/components/users/InviteTeammateFlow", () => ({
  default: ({
    initialValue,
    onClose,
    onInvited,
  }: {
    initialValue: string;
    onClose: () => void;
    onInvited: () => void;
  }) => (
    <div role="dialog" aria-label="Invite teammate">
      <input aria-label="Invite value" value={initialValue} readOnly />
      <button onClick={onClose}>Cancel invite</button>
      <button
        onClick={() => {
          onInvited();
          onClose();
        }}
      >
        Complete invite
      </button>
    </div>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) =>
      (fallback ?? key).replace("{{name}}", values?.name ?? ""),
  }),
}));

const people = [
  {
    userId: 1,
    username: "owner",
    displayName: "Owner",
    teamName: "Default",
    enabled: true,
  },
];
function Picker({ disabled }: { disabled: boolean }) {
  const [value, setValue] = useState([1]);
  return (
    <UserSelector
      presentation="cards"
      value={value}
      onChange={setValue}
      disabled={disabled}
    />
  );
}
function show(disabled = false, users = people) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(qk.users(), users);
  return render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <Picker disabled={disabled} />
      </MantineProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.isAdmin = true;
  auth.isTeamLeader = false;
  auth.isAnonymous = false;
  vi.mocked(fetchUsers).mockResolvedValue(people);
});

it("carries arbitrary search text into the invite flow and retains selected participants on cancel", async () => {
  show();
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search people or teams" }),
    { target: { value: "Alex + team & friends" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Add teammate: Alex + team & friends" }),
  );
  expect(await screen.findByLabelText("Invite value")).toHaveValue(
    "Alex + team & friends",
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel invite" }));
  expect(
    screen.getByRole("textbox", { name: "Search people or teams" }),
  ).toHaveValue("Alex + team & friends");
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search people or teams" }),
    { target: { value: "" } },
  );
  expect(screen.getByRole("checkbox", { name: /Owner/ })).toBeChecked();
  expect(fetchUsers).not.toHaveBeenCalled();
});

it("offers an empty invite even with no participants and refreshes after success", async () => {
  show(false, []);
  fireEvent.click(screen.getByRole("button", { name: "Add a teammate" }));
  expect(await screen.findByLabelText("Invite value")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Complete invite" }));
  await waitFor(() => expect(fetchUsers).toHaveBeenCalledOnce());
  expect(await screen.findByRole("checkbox", { name: /Owner/ })).toBeChecked();
});

it("offers invites to team leaders but not ordinary members or guests", () => {
  auth.isAdmin = false;
  const member = show();
  expect(
    screen.queryByRole("button", { name: "Add a teammate" }),
  ).not.toBeInTheDocument();
  member.unmount();
  auth.isTeamLeader = true;
  const leader = show(true);
  expect(screen.getByRole("button", { name: "Add a teammate" })).toBeDisabled();
  leader.unmount();
  auth.isAnonymous = true;
  show();
  expect(
    screen.queryByRole("button", { name: "Add a teammate" }),
  ).not.toBeInTheDocument();
});
