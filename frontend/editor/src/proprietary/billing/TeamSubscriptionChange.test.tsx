import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TeamSubscriptionChange } from "@app/billing/TeamSubscriptionChange";
import { teamSubscriptionChange } from "@app/services/serverPlanCheckout";

vi.mock("@app/services/serverPlanCheckout", () => ({
  teamSubscriptionChange: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values: Record<string, unknown> = {}) =>
      fallback.replace(/{{(\w+)}}/g, (_, key: string) =>
        String(values[key] ?? key),
      ),
  }),
}));
vi.mock("@app/ui", () => ({
  Banner: ({
    title,
    action,
    children,
  }: {
    title: string;
    action?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <section>
      {title}
      {children}
      {action}
    </section>
  ),
  Button: ({
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant: string }) => (
    <button {...props} />
  ),
}));
const pending = {
  scheduleId: "sched_team",
  quantity: 1,
  effectiveAt: 1800000000,
  interval: "month",
};
beforeEach(() => vi.clearAllMocks());

it("shows future capacity and lets the leader keep the current plan", async () => {
  vi.mocked(teamSubscriptionChange)
    .mockResolvedValueOnce({ pending })
    .mockResolvedValueOnce({ pending: null });
  render(<TeamSubscriptionChange refreshKey={0} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Keep current plan" }),
  );
  await waitFor(() =>
    expect(teamSubscriptionChange).toHaveBeenCalledWith("cancel", "sched_team"),
  );
  await waitFor(() =>
    expect(screen.queryByRole("button")).not.toBeInTheDocument(),
  );
});

it("does not claim a failed cancellation succeeded", async () => {
  vi.mocked(teamSubscriptionChange)
    .mockResolvedValueOnce({ pending })
    .mockRejectedValueOnce(new Error("offline"));
  render(<TeamSubscriptionChange refreshKey={0} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Keep current plan" }),
  );
  expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
});

it("does not offer cancellation for an unsupported schedule", async () => {
  vi.mocked(teamSubscriptionChange).mockResolvedValue({
    pending: null,
    unsupportedSchedule: true,
  });
  render(<TeamSubscriptionChange refreshKey={0} />);
  expect(await screen.findByText(/billing support/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
