import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("@app/services/specialErrorToasts", () => ({
  showSpecialErrorToast: vi.fn(() => false),
}));
vi.mock("@app/services/saasErrorInterceptor", () => ({
  handleSaaSError: vi.fn(() => false),
}));
vi.mock("@app/services/errorUtils", () => ({
  broadcastErroredFiles: vi.fn(),
  extractErrorFileIds: vi.fn(() => []),
  normalizeAxiosErrorData: vi.fn(async (d: unknown) => d),
}));

const hrefs: string[] = [];

/** Serve the app from `base`, sitting on `pathname`, then load the handler fresh. */
async function loadAt(base: string, pathname: string) {
  document.head.innerHTML = `<base href="${base}" />`;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      pathname,
      search: "",
      origin: "http://localhost:3000",
      get href() {
        // Absolute: jsdom resolves <base href> against this.
        return "http://localhost:3000" + pathname;
      },
      set href(v: string) {
        hrefs.push(v);
      },
    },
  });
  vi.resetModules();
  return (await import("@app/services/httpErrorHandler")).handleHttpError;
}

const unauthorized = {
  isAxiosError: true,
  message: "unauthorized",
  config: {},
  response: { status: 401, data: {} },
};

beforeEach(() => {
  hrefs.length = 0;
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.resetModules());

describe("401 return path is router-relative", () => {
  // Login replays this through navigate(), which re-applies the router
  // basename. Carrying /app here produced /app/app/compress.
  it("strips the base path on a subpath deploy", async () => {
    const handle = await loadAt("/app/", "/app/compress");
    await handle(unauthorized);

    expect(sessionStorage.getItem("stirling_post_login_path")).toBe(
      "/compress",
    );
    expect(hrefs[0]).toBe("/app/login?from=%2Fcompress");
  });

  it("is unchanged at the origin root", async () => {
    const handle = await loadAt("/", "/compress");
    await handle(unauthorized);

    expect(sessionStorage.getItem("stirling_post_login_path")).toBe(
      "/compress",
    );
    expect(hrefs[0]).toBe("/login?from=%2Fcompress");
  });
});
