import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AddParticipantsFlow } from "@app/components/tools/certSign/modals/AddParticipantsFlow";
import { qk } from "@app/query/keys";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
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

it("adds signers invited by email alongside the default reason", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(qk.users(), [
    { userId: 2, username: "bob", teamName: "Sales", enabled: true },
  ]);
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MantineProvider env="test">
          <AddParticipantsFlow opened onClose={vi.fn()} onSubmit={onSubmit} />
        </MantineProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const add = screen.getByRole("button", { name: "Add 0 Participant(s)" });
  expect(add).toBeDisabled();

  await user.type(
    screen.getByRole("textbox", { name: /Invite by email/ }),
    "guest@example.com{Enter}",
  );
  await user.type(
    screen.getByRole("textbox", { name: /Default Reason/ }),
    "Approval",
  );
  await user.click(
    screen.getByRole("button", { name: "Add 1 Participant(s)" }),
  );

  expect(onSubmit).toHaveBeenCalledWith([], ["guest@example.com"], "Approval");
});
