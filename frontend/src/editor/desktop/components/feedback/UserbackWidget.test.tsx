import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FeedbackConfig {
  enableFeedback: boolean;
}

interface SessionUser {
  id: string;
  email: string;
  username: string;
}

const ADA: SessionUser = {
  id: "ada@example.com",
  email: "ada@example.com",
  username: "Ada",
};

const { userback, localConfig, saas, auth } = vi.hoisted(() => {
  const saasState: { config: FeedbackConfig | null } = { config: null };
  const authState: { user: SessionUser | null } = { user: null };
  return {
    userback: vi.fn((): Promise<unknown> => new Promise(() => {})),
    localConfig: { enableFeedback: true },
    saas: saasState,
    auth: authState,
  };
});

vi.mock("@userback/widget", () => ({ default: userback }));
vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({ user: auth.user }),
}));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: localConfig }),
}));
vi.mock("@editor/hooks/useSaasAppConfig", () => ({
  useSaasAppConfig: () => saas.config,
}));

// The token is read at module load, so import only after stubbing it.
async function renderWidget() {
  const { default: UserbackWidget } =
    await import("@editor/components/feedback/UserbackWidget");
  render(<UserbackWidget />);
}

describe("UserbackWidget (desktop)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_USERBACK_TOKEN", "token");
    localConfig.enableFeedback = true;
    saas.config = { enableFeedback: true };
    auth.user = ADA;
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    userback.mockReset();
  });

  it("loads Userback with the SaaS user's details", async () => {
    await renderWidget();
    expect(userback).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({
        user_data: {
          id: "ada@example.com",
          info: { name: "Ada", email: "ada@example.com" },
        },
      }),
    );
  });

  it("does not load Userback outside SaaS mode", async () => {
    saas.config = null;
    await renderWidget();
    expect(userback).not.toHaveBeenCalled();
  });

  it("does not load Userback while the SaaS server has feedback off", async () => {
    saas.config = { enableFeedback: false };
    await renderWidget();
    expect(userback).not.toHaveBeenCalled();
  });

  it("does not load Userback while the local config has feedback off", async () => {
    localConfig.enableFeedback = false;
    await renderWidget();
    expect(userback).not.toHaveBeenCalled();
  });

  it("does not load Userback for a session without an email", async () => {
    auth.user = { id: "desktop-saas-user", email: "", username: "" };
    await renderWidget();
    expect(userback).not.toHaveBeenCalled();
  });

  it("does not load Userback without a token", async () => {
    vi.stubEnv("VITE_USERBACK_TOKEN", "");
    await renderWidget();
    expect(userback).not.toHaveBeenCalled();
  });
});
