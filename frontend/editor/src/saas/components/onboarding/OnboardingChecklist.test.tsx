import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OnboardingChecklist } from "@app/components/onboarding/OnboardingChecklist";
import type { AccountCreatedAt } from "@app/components/onboarding/accountCreatedAt";
import type { NavKey } from "@app/components/shared/config/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const FLOW = "onboarding::flow::saas-checklist";
const DOWNLOAD = "onboarding.checklist.downloadDesktop.title";
const INVITE = "onboarding.checklist.inviteTeam.title";
const TOUR = "onboarding.checklist.takeTour.title";

const { account, inviteTarget } = vi.hoisted(() => ({
  account: vi.fn<() => AccountCreatedAt>(),
  inviteTarget: vi.fn<() => NavKey | null>(),
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ isAnonymous: false, loading: false }),
}));
vi.mock("@app/components/onboarding/accountCreatedAt", () => ({
  useAccountCreatedAt: account,
}));
vi.mock("@app/components/onboarding/checklistInviteTarget", () => ({
  useChecklistInviteTarget: inviteTarget,
}));
vi.mock("@app/components/onboarding/checklistSetupItem", () => ({
  useChecklistSetupItem: () => ({
    item: {
      id: "download-desktop",
      titleKey: "onboarding.checklist.downloadDesktop.title",
      titleFallback: "Download Stirling for Desktop",
      descriptionKey: "onboarding.checklist.downloadDesktop.description",
      descriptionFallback: "Run Stirling natively on your machine",
      onClick: () => {},
    },
    dialog: null,
  }),
}));
vi.mock("@app/utils/appSettings", () => ({ openAppSettings: vi.fn() }));
vi.mock("@app/constants/events", () => ({ requestStartTour: vi.fn() }));

const checklist = () => screen.queryByTestId("onboarding-checklist");

describe("OnboardingChecklist", () => {
  beforeEach(() => {
    localStorage.clear();
    account.mockReturnValue({
      loading: false,
      createdAt: new Date(Date.now() - DAY_MS),
    });
    inviteTarget.mockReturnValue("users");
  });

  it("shows every step to a new account", () => {
    render(<OnboardingChecklist />);
    expect(checklist()).not.toBeNull();
    expect(screen.getByText(DOWNLOAD)).toBeTruthy();
    expect(screen.getByText(INVITE)).toBeTruthy();
    expect(screen.getByText(TOUR)).toBeTruthy();
    expect(screen.getByText("0 / 3")).toBeTruthy();
  });

  it("stays hidden for accounts older than two weeks", () => {
    account.mockReturnValue({
      loading: false,
      createdAt: new Date(Date.now() - 15 * DAY_MS),
    });
    render(<OnboardingChecklist />);
    expect(checklist()).toBeNull();
  });

  it("stays hidden while the account age is resolving", () => {
    account.mockReturnValue({ loading: true, createdAt: null });
    render(<OnboardingChecklist />);
    expect(checklist()).toBeNull();
  });

  it("shows when the account age is unknown", () => {
    account.mockReturnValue({ loading: false, createdAt: null });
    render(<OnboardingChecklist />);
    expect(checklist()).not.toBeNull();
  });

  it("drops the invite step when there is no one to invite", () => {
    inviteTarget.mockReturnValue(null);
    render(<OnboardingChecklist />);
    expect(screen.queryByText(INVITE)).toBeNull();
    expect(screen.getByText("0 / 2")).toBeTruthy();
  });

  it("lists only the steps left from earlier sessions", () => {
    localStorage.setItem(
      `${FLOW}::progress`,
      JSON.stringify(["download-desktop", "invite-team"]),
    );
    render(<OnboardingChecklist />);
    expect(screen.queryByText(DOWNLOAD)).toBeNull();
    expect(screen.queryByText(INVITE)).toBeNull();
    expect(screen.getByText(TOUR)).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
  });

  it("disappears once every step is done", () => {
    localStorage.setItem(
      `${FLOW}::progress`,
      JSON.stringify(["download-desktop", "invite-team"]),
    );
    render(<OnboardingChecklist />);
    fireEvent.click(screen.getByText(TOUR));
    expect(checklist()).toBeNull();
  });

  it("snoozes for a week when closed", () => {
    const { unmount } = render(<OnboardingChecklist />);
    fireEvent.click(
      screen.getByRole("button", { name: "onboarding.checklist.dismiss" }),
    );
    expect(checklist()).toBeNull();
    unmount();

    render(<OnboardingChecklist />);
    expect(checklist()).toBeNull();
  });

  it("returns a week after it was closed", () => {
    localStorage.setItem(
      `${FLOW}::dismissedAt`,
      JSON.stringify(Date.now() - 8 * DAY_MS),
    );
    render(<OnboardingChecklist />);
    expect(checklist()).not.toBeNull();
  });

  it("ignores the permanent dismissal flag from before snoozing", () => {
    localStorage.setItem(`${FLOW}::seen`, "true");
    render(<OnboardingChecklist />);
    expect(checklist()).not.toBeNull();
  });
});
