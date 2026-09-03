import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, opts?: Record<string, unknown>) => {
      const base = fallback ?? key;
      return opts
        ? base.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? ""))
        : base;
    },
  }),
}));

import { CapacityLine } from "@portal/components/users/CapacityLine";
import { resolveUserCapacity } from "@app/billing";

/** What `calculateMaxAllowedUsers()` returns for a licence with `users: 0`. */
const JAVA_INT_MAX = 2147483647;

const teamCapacity = (over: Record<string, unknown> = {}) =>
  resolveUserCapacity({
    used: 64,
    maxAllowedUsers: 200,
    serverQuantity: 2,
    userBlockSize: 100,
    premiumEnabled: true,
    ...over,
  });

describe("CapacityLine", () => {
  it("reads as the count against the limit", () => {
    render(<CapacityLine capacity={teamCapacity()} onAddCapacity={vi.fn()} />);
    expect(screen.getByText("64 of 200 users")).toBeInTheDocument();
  });

  it("never prints the uncapped sentinel", () => {
    render(
      <CapacityLine
        capacity={resolveUserCapacity({
          used: 64,
          maxAllowedUsers: JAVA_INT_MAX,
          premiumEnabled: true,
        })}
        onAddCapacity={vi.fn()}
      />,
    );
    expect(screen.getByText("64 users")).toBeInTheDocument();
    expect(screen.queryByText(/2147483647/)).not.toBeInTheDocument();
  });

  it("offers nothing to buy on an uncapped licence, even when a handler is passed", () => {
    render(
      <CapacityLine
        capacity={resolveUserCapacity({
          used: 64,
          maxAllowedUsers: JAVA_INT_MAX,
          premiumEnabled: true,
        })}
        onAddCapacity={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names the seat flow rather than capacity on an Enterprise licence", () => {
    render(
      <CapacityLine
        capacity={resolveUserCapacity({
          used: 64,
          maxAllowedUsers: 250,
          premiumEnabled: true,
        })}
        onAddCapacity={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Update seats" }),
    ).toBeInTheDocument();
  });

  it("buys capacity when the action is used", () => {
    const onAddCapacity = vi.fn();
    render(
      <CapacityLine capacity={teamCapacity()} onAddCapacity={onAddCapacity} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add capacity" }));
    expect(onAddCapacity).toHaveBeenCalledOnce();
  });

  it("explains the held slots only when something invisible is using one", () => {
    const { rerender } = render(
      <CapacityLine capacity={teamCapacity()} onAddCapacity={vi.fn()} />,
    );
    expect(screen.getByText("64 of 200 users")).not.toHaveAttribute("title");

    rerender(
      <CapacityLine
        capacity={teamCapacity({ disabled: 14, pendingInvites: 6 })}
        onAddCapacity={vi.fn()}
      />,
    );
    expect(screen.getByText("64 of 200 users")).toHaveAttribute(
      "title",
      "Includes 14 disabled and 6 invited, which each use a slot.",
    );
  });

  it("renders as text only when the build has no way to buy", () => {
    render(<CapacityLine capacity={teamCapacity()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("64 of 200 users")).toBeInTheDocument();
  });
});
