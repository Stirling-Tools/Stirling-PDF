import { AxiosError } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { convertProcessor } from "@editor/hooks/tools/convert/useConvertOperation";
import { defaultParameters } from "@editor/hooks/tools/convert/useConvertParameters";
import { expectConsole } from "@editor/tests/failOnConsole";

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({
  default: {
    post: api.post,
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  },
}));

const parameters = {
  ...defaultParameters,
  fromExtension: "epub",
  toExtension: "pdf",
  useStirlingOfficeConvert: true,
};
const ebook = (name: string) =>
  new File(["ebook"], name, { type: "application/epub+zip" });
const reason = "Only part of book.epub could be converted";

const failedResponse = () => ({
  status: 500,
  statusText: "Internal Server Error",
  headers: {},
  config: { headers: {} },
  data: new Blob([JSON.stringify({ detail: reason })], {
    type: "application/problem+json",
  }),
});

beforeEach(() => {
  api.post.mockReset();
});

describe("conversion failure reasons", () => {
  test.each(["browser", "desktop"])(
    "preserves the backend reason and HTTP metadata for %s errors",
    async (kind) => {
      const error =
        kind === "browser"
          ? Object.assign(
              new AxiosError("Request failed with status code 500"),
              { response: failedResponse() },
            )
          : {
              isAxiosError: true,
              message: "Request failed with status code 500",
              response: failedResponse(),
            };
      const payload = error.response?.data;
      api.post.mockRejectedValueOnce(error);

      await expect(
        convertProcessor(parameters, [ebook("book.epub")]),
      ).rejects.toBe(error);

      expect(error.message).toBe(reason);
      expect(error.response?.status).toBe(500);
      expect(error.response?.data).toBe(payload);
    },
  );

  test("reports the first server reason when every ebook fails", async () => {
    expectConsole.warn(/Failed to convert file book.epub/);
    expectConsole.warn(/Failed to convert file other.epub/);
    const error = Object.assign(new AxiosError("Request failed"), {
      response: failedResponse(),
    });
    api.post
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(new Error("Second conversion failed"));

    await expect(
      convertProcessor(parameters, [ebook("book.epub"), ebook("other.epub")]),
    ).rejects.toBe(error);

    expect(error.message).toBe(reason);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  test("keeps a successful ebook when another conversion fails", async () => {
    expectConsole.warn(/Failed to convert file other.epub/);
    api.post
      .mockResolvedValueOnce({
        data: new Blob(["%PDF"], { type: "application/pdf" }),
        headers: {},
      })
      .mockRejectedValueOnce(
        Object.assign(new AxiosError("Request failed"), {
          response: failedResponse(),
        }),
      );

    const result = await convertProcessor(parameters, [
      ebook("book.epub"),
      ebook("other.epub"),
    ]);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("book.pdf");
  });

  test("preserves network failures that have no server response", async () => {
    const error = new Error("Network unavailable");
    api.post.mockRejectedValueOnce(error);

    await expect(
      convertProcessor(parameters, [ebook("book.epub")]),
    ).rejects.toBe(error);
  });
});
