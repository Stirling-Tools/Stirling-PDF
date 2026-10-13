import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiBaseUrl } from "@app/services/apiClientConfig";
import { getFontBaseUrl } from "@app/services/fontBaseUrl";
import { BASE_PATH } from "@app/constants/app";

vi.mock("@app/services/apiClientConfig", () => ({
  getApiBaseUrl: vi.fn(() => "/"),
}));

const mockedApiBase = vi.mocked(getApiBaseUrl);

describe("getFontBaseUrl", () => {
  afterEach(() => {
    mockedApiBase.mockReturnValue("/");
  });

  it("resolves fonts under the API root as an absolute URL", () => {
    expect(getFontBaseUrl()).toBe(`${window.location.origin}/fonts`);
  });

  it("keeps a context-path prefix", () => {
    mockedApiBase.mockReturnValue("/stirling/");
    expect(getFontBaseUrl()).toBe(`${window.location.origin}/stirling/fonts`);
  });

  it("keeps an absolute API origin", () => {
    mockedApiBase.mockReturnValue("http://127.0.0.1:49152");
    expect(getFontBaseUrl()).toBe("http://127.0.0.1:49152/fonts");
  });

  it("resolves a slashless API base under the origin", () => {
    mockedApiBase.mockReturnValue("api");
    expect(getFontBaseUrl()).toBe(`${window.location.origin}/api/fonts`);
  });

  it("falls back to the app root when the API base is unset", () => {
    // import.meta.env.VITE_API_BASE_URL is undefined in Storybook and bare builds.
    mockedApiBase.mockReturnValue(undefined as unknown as string);
    expect(getFontBaseUrl()).toBe(
      `${window.location.origin}${BASE_PATH}/fonts`,
    );
  });
});
