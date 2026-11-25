import { describe, expect, it, vi } from "vitest";
import { getFontBaseUrl } from "@editor/services/fontBaseUrl";
import { BASE_PATH } from "@editor/constants/app";

vi.mock("@editor/services/apiClientConfig", () => ({
  getApiBaseUrl: vi.fn(() => "https://pdf.example.test"),
}));

describe("desktop getFontBaseUrl", () => {
  it("loads fonts from the app bundle, not the connected server", () => {
    expect(getFontBaseUrl()).toBe(
      `${window.location.origin}${BASE_PATH}/fonts`,
    );
  });
});
