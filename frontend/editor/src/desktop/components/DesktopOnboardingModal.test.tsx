import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DesktopOnboardingModal } from "@app/components/DesktopOnboardingModal";

const { isAuthenticated } = vi.hoisted(() => ({
  isAuthenticated: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@app/services/authService", () => ({
  authService: { isAuthenticated },
}));

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { switchToLocal: vi.fn() },
}));

vi.mock("@app/components/onboarding/OnboardingSlideShell", () => ({
  default: ({ opened }: { opened: boolean }) =>
    opened ? <div role="dialog">Desktop onboarding</div> : null,
  ShellHero: () => null,
}));

vi.mock("@app/components/SetupWizard", () => ({
  SetupWizard: () => null,
}));

vi.mock("@app/components/onboarding/slides/WelcomeSlide", () => ({
  default: () => ({ title: "Welcome", body: null }),
}));

vi.mock(
  "@app/components/onboarding/classificationDemo/ClassificationDemoModal",
  () => ({ ClassificationDemoModal: () => null }),
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
});
