// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import {
  copyBudgetBytes,
  inMemoryFormData,
  installInMemoryUploads,
  uploadSafeFormData,
  uploadsNeedInMemoryFiles,
} from "@editor/utils/inMemoryUpload";

const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function pdfForm(): { form: FormData; file: File } {
  const file = new File(["%PDF-1.7"], "a.pdf", { type: "application/pdf" });
  const form = new FormData();
  form.append("fileInput", file);
  form.append("angle", "90");
  return { form, file };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadsNeedInMemoryFiles", () => {
  it("copies uploads in Safari, DuckDuckGo on macOS and every iOS browser", () => {
    expect(uploadsNeedInMemoryFiles(SAFARI)).toBe(true);
    expect(
      uploadsNeedInMemoryFiles(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15 Ddg/26.0",
      ),
    ).toBe(true);
    expect(
      uploadsNeedInMemoryFiles(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(true);
  });

  it("leaves Chrome, Edge and Firefox streaming the original file", () => {
    expect(uploadsNeedInMemoryFiles(CHROME)).toBe(false);
    expect(
      uploadsNeedInMemoryFiles(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      ),
    ).toBe(false);
    expect(
      uploadsNeedInMemoryFiles(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.0; rv:144.0) Gecko/20100101 Firefox/144.0",
      ),
    ).toBe(false);
  });
});

describe("copyBudgetBytes", () => {
  it("allows less on touch devices, where iOS kills tabs sooner", () => {
    expect(copyBudgetBytes(5)).toBeLessThan(copyBudgetBytes(0));
  });
});

describe("inMemoryFormData", () => {
  it("keeps every field and copies each file with its name and type", async () => {
    const { form, file } = pdfForm();
    const copy = await inMemoryFormData(form, 1024);
    const copied = copy.get("fileInput") as File;
    expect(copy.get("angle")).toBe("90");
    expect(copied).not.toBe(file);
    expect(copied.name).toBe("a.pdf");
    expect(copied.type).toBe("application/pdf");
    expect(await copied.text()).toBe("%PDF-1.7");
  });

  it("re-wraps files past the budget instead of copying them", async () => {
    const small = new File(["1234"], "small.pdf");
    const large = new File(["12345678"], "large.pdf", {
      type: "application/pdf",
    });
    const form = new FormData();
    form.append("fileInput", small);
    form.append("fileInput", large);
    const [copiedSmall, wrappedLarge] = (
      await inMemoryFormData(form, 10)
    ).getAll("fileInput") as File[];
    expect(await copiedSmall.text()).toBe("1234");
    expect(wrappedLarge).not.toBe(large);
    expect(wrappedLarge.name).toBe("large.pdf");
    expect(wrappedLarge.type).toBe("application/pdf");
    expect(await wrappedLarge.text()).toBe("12345678");
  });
});

describe("uploadSafeFormData", () => {
  it("returns the same form outside WebKit", async () => {
    vi.stubGlobal("navigator", { userAgent: CHROME, maxTouchPoints: 0 });
    const { form } = pdfForm();
    expect(await uploadSafeFormData(form)).toBe(form);
  });

  it("returns a copy in WebKit", async () => {
    vi.stubGlobal("navigator", { userAgent: SAFARI, maxTouchPoints: 0 });
    const { form, file } = pdfForm();
    const sent = await uploadSafeFormData(form);
    expect(sent).not.toBe(form);
    expect(sent.get("fileInput")).not.toBe(file);
  });
});

describe("installInMemoryUploads", () => {
  function fakeClient() {
    const use = vi.fn();
    return { client: { interceptors: { request: { use } } }, use };
  }

  it("installs nothing outside WebKit", () => {
    vi.stubGlobal("navigator", { userAgent: CHROME, maxTouchPoints: 0 });
    const { client, use } = fakeClient();
    installInMemoryUploads(client as never);
    expect(use).not.toHaveBeenCalled();
  });

  it("copies FormData bodies and leaves every other body alone in WebKit", async () => {
    vi.stubGlobal("navigator", { userAgent: SAFARI, maxTouchPoints: 0 });
    const { client, use } = fakeClient();
    installInMemoryUploads(client as never);
    const interceptor = use.mock.calls[0][0] as (
      config: InternalAxiosRequestConfig,
    ) => Promise<InternalAxiosRequestConfig>;

    const { form, file } = pdfForm();
    const sent = await interceptor({
      data: form,
    } as InternalAxiosRequestConfig);
    expect((sent.data as FormData).get("fileInput")).not.toBe(file);

    const json = { data: { a: 1 } } as InternalAxiosRequestConfig;
    expect(await interceptor(json)).toBe(json);
  });
});
