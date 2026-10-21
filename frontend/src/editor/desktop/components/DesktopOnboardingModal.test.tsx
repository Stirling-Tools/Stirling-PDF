import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { DesktopOnboardingModal } from "@app/components/DesktopOnboardingModal";

const { isAuthenticated } = vi.hoisted(() => ({
  isAuthenticated: vi.fn<() => Promise<boolean>>(),
}));
const { automationEnabled, switchToLocal } = vi.hoisted(() => ({
  automationEnabled: vi.fn(() => false),
  switchToLocal: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@app/components/policies/usePoliciesEnabled", () => ({
  usePoliciesEnabled: automationEnabled,
}));

vi.mock("@app/services/authService", () => ({
  authService: { isAuthenticated },
}));

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { switchToLocal },
}));

vi.mock("@app/components/onboarding/OnboardingSlideShell", () => ({
  default: ({
    opened,
    body,
    onClose,
  }: {
    opened: boolean;
    body: ReactNode;
    onClose: () => void;
  }) =>
    opened ? (
      <div role="dialog">
        Desktop onboarding{body}
        <button onClick={onClose}>Continue</button>
      </div>
    ) : null,
  ShellHero: () => null,
}));

vi.mock("@app/components/SetupWizard", () => ({
  SetupWizard: ({ onComplete }: { onComplete: () => void }) => (
    <div>
      Sign in to a server<button onClick={onComplete}>Skip sign-in</button>
    </div>
  ),
}));

vi.mock("@app/components/onboarding/slides/WelcomeSlide", () => ({
  default: () => ({ title: "Welcome", body: null }),
}));

vi.mock(
  "@app/components/onboarding/classificationDemo/ClassificationDemoModal",
  () => ({
    ClassificationDemoModal: () => <div role="dialog">Downloads demo</div>,
  }),
);

function renderModal() {
  return render(
    <MemoryRouter>
      <DesktopOnboardingModal />
    </MemoryRouter>,
  );
}

describe("DesktopOnboardingModal", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    isAuthenticated.mockReset().mockResolvedValue(true);
    automationEnabled.mockReturnValue(false);
  });

  it("shows onboarding to a new desktop user", async () => {
    renderModal();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("honours the shared onboarding bypass", async () => {
    sessionStorage.setItem("onboarding::bypass-all", "true");

    renderModal();

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("requires the sign-in prompt before skipping and withholds the demo", async () => {
    isAuthenticated.mockResolvedValue(false);
    renderModal();
    fireEvent.click(await screen.findByText("Continue"));
    expect(screen.getByText("Sign in to a server")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Skip sign-in"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      localStorage.getItem("stirling-desktop-classification-demo-seen"),
    ).toBeNull();
  });

  it("offers the deferred demo after a skipped user later signs in", async () => {
    localStorage.setItem("stirling-desktop-onboarding-seen.v2", "true");
    const view = renderModal();
    expect(screen.queryByText("Downloads demo")).not.toBeInTheDocument();
    automationEnabled.mockReturnValue(true);
    view.rerender(
      <MemoryRouter>
        <DesktopOnboardingModal />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Downloads demo")).toBeInTheDocument();
  });
});
