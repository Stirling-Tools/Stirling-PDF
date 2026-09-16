import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@app/constants/app", () => ({
  withBasePath: (path: string) => "/app" + path,
  stripBasePath: (path: string) => path.replace(/^\/app/, ""),
}));
import { redirectToLogin } from "@app/auth/redirectToLogin";
let href: string;
beforeEach(() => {
  href = "";
  vi.stubGlobal("location", {
    pathname: "/app/settings/billing",
    search: "?source=trial",
    get href() {
      return href;
    },
    set href(value: string) {
      href = value;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("uses normal login with a safe destination and excludes the token fragment", () => {
  redirectToLogin();
  expect(href).toBe("/app/login?next=%2Fsettings%2Fbilling%3Fsource%3Dtrial");
});
it("does not redirect while already on login", () => {
  location.pathname = "/app/login";
  redirectToLogin();
  expect(href).toBe("");
});
