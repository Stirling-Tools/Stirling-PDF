import { describe, expect, it } from "vitest";
import { isUpdatePopupAllowed } from "@app/components/shared/updatePopupGate";

describe("isUpdatePopupAllowed", () => {
  it("returns false until config has loaded", () => {
    expect(isUpdatePopupAllowed(null, false)).toBe(false);
  });

  it("shows on desktop when the backend allows it", () => {
    expect(isUpdatePopupAllowed({ shouldShowUpdate: true }, false)).toBe(true);
  });

  it("never shows on a mobile / narrow viewport", () => {
    expect(isUpdatePopupAllowed({ shouldShowUpdate: true }, true)).toBe(false);
  });

  it("hides when the backend says not to (non-admin / showUpdate disabled)", () => {
    expect(isUpdatePopupAllowed({ shouldShowUpdate: false }, false)).toBe(
      false,
    );
  });

  it("fails closed when the backend omits the decision (e.g. 401 fallback)", () => {
    expect(isUpdatePopupAllowed({ enableLogin: true }, false)).toBe(false);
  });
});
