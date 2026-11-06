// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  inMemoryFormData,
  uploadsNeedInMemoryFiles,
} from "@editor/utils/inMemoryUpload";

describe("uploadsNeedInMemoryFiles", () => {
  it("copies uploads in Safari and every iOS browser", () => {
    expect(
      uploadsNeedInMemoryFiles(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      ),
    ).toBe(true);
    expect(
      uploadsNeedInMemoryFiles(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(true);
  });

  it("leaves Chrome, Edge and Firefox streaming the original file", () => {
    expect(
      uploadsNeedInMemoryFiles(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
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

describe("inMemoryFormData", () => {
  it("keeps every field and copies each file with its name and type", async () => {
    const form = new FormData();
    form.append(
      "fileInput",
      new File(["%PDF-1.7"], "a.pdf", { type: "application/pdf" }),
    );
    form.append("angle", "90");
    const copy = await inMemoryFormData(form);
    const file = copy.get("fileInput") as File;
    expect(copy.get("angle")).toBe("90");
    expect(file).not.toBe(form.get("fileInput"));
    expect(file.name).toBe("a.pdf");
    expect(file.type).toBe("application/pdf");
    expect(await file.text()).toBe("%PDF-1.7");
  });

  it("sends files past the memory budget as they are", async () => {
    const small = new File(["1234"], "small.pdf");
    const large = new File(["12345678"], "large.pdf");
    const form = new FormData();
    form.append("fileInput", small);
    form.append("fileInput", large);
    const [copiedSmall, keptLarge] = (await inMemoryFormData(form, 10)).getAll(
      "fileInput",
    ) as File[];
    expect(copiedSmall).not.toBe(small);
    expect(await copiedSmall.text()).toBe("1234");
    expect(keptLarge).toBe(large);
  });
});
