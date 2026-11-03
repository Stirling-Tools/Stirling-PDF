import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { userback, appConfig } = vi.hoisted(() => ({
  userback: vi.fn(() => new Promise<never>(() => {})),
  appConfig: { enableFeedback: false },
}));

vi.mock("@userback/widget", () => ({ default: userback }));
vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "ada@example.com",
      user_metadata: { full_name: "Ada" },
    },
  }),
}));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: appConfig }),
}));

// The token is read at module load, so import only after stubbing it.
async function renderWidget() {
  const { default: UserbackWidget } =
    await import("@editor/components/feedback/UserbackWidget");
  render(<UserbackWidget />);
}

describe("UserbackWidget", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_USERBACK_TOKEN", "token");
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    userback.mockClear();
  });

  it("does not load Userback while the server has feedback off", async () => {
    appConfig.enableFeedback = false;
    await renderWidget();
    expect(userback).not.toHaveBeenCalled();
  });

  it("loads Userback with the user's details when feedback is on", async () => {
    appConfig.enableFeedback = true;
    await renderWidget();
    expect(userback).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        user_data: {
          id: "user-1",
          info: { name: "Ada", email: "ada@example.com" },
        },
      }),
    );
  });
});
