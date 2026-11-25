import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { userback, appConfig, user } = vi.hoisted(() => ({
  userback: vi.fn((): Promise<unknown> => new Promise(() => {})),
  appConfig: { enableFeedback: false },
  user: {
    id: "user-1",
    email: "ada@example.com",
    user_metadata: { full_name: "Ada" },
  },
}));

vi.mock("@userback/widget", () => ({ default: userback }));
vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({ user }),
}));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: appConfig }),
}));

// The token is read at module load, so import only after stubbing it.
async function renderWidget() {
  const { default: UserbackWidget } =
    await import("@editor/components/feedback/UserbackWidget");
  const view = render(<UserbackWidget />);
  return {
    unmount: view.unmount,
    rerender: () => view.rerender(<UserbackWidget />),
  };
}

// Like the real loader, every call gets the same pending load.
function pendingLoad() {
  let resolve!: (instance: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  userback.mockReturnValue(promise);
  return { promise, resolve };
}

describe("UserbackWidget", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_USERBACK_TOKEN", "token");
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    userback.mockReset();
    user.email = "ada@example.com";
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

  it("destroys a load that finishes after the widget has gone", async () => {
    appConfig.enableFeedback = true;
    const load = pendingLoad();
    const { unmount } = await renderWidget();
    unmount();

    const instance = { destroy: vi.fn() };
    load.resolve(instance);
    await load.promise;

    expect(instance.destroy).toHaveBeenCalled();
    const { getUserbackInstance } =
      await import("@editor/components/feedback/userbackInstance");
    expect(getUserbackInstance()).toBeNull();
  });

  it("hands a pending load to the run that replaced the one that started it", async () => {
    appConfig.enableFeedback = true;
    const load = pendingLoad();
    const { rerender } = await renderWidget();
    user.email = "ada@new.example.com";
    rerender();

    const instance = { destroy: vi.fn() };
    load.resolve(instance);
    await load.promise;

    expect(instance.destroy).not.toHaveBeenCalled();
    const { getUserbackInstance } =
      await import("@editor/components/feedback/userbackInstance");
    expect(getUserbackInstance()).toBe(instance);
  });
});
