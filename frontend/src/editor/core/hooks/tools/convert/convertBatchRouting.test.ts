import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildConvertFormData,
  convertProcessor,
} from "@editor/hooks/tools/convert/useConvertOperation";
import { defaultParameters } from "@editor/hooks/tools/convert/useConvertParameters";

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

const CONVERSION_ROUTES = [
  ["pdf", "docx", "pdf/word", "pdf-to-word"],
  ["pdf", "odt", "pdf/word", "pdf-to-word"],
  ["pdf", "pptx", "pdf/presentation", "pdf-to-presentation"],
  ["pdf", "odp", "pdf/presentation", "pdf-to-presentation"],
  ["pdf", "txt", "pdf/text", "pdf-to-text"],
  ["pdf", "rtf", "pdf/text", "pdf-to-rtf"],
  ["pdf", "xlsx", "pdf/xlsx", "pdf-to-xlsx"],
  ["pdf", "html", "pdf/html", "pdf-to-html"],
  ["pdf", "md", "pdf/markdown", "pdf-to-markdown"],
  ["pdf", "xml", "pdf/xml", "pdf-to-xml"],
  ["pdf", "pdfa", "pdf/pdfa", "pdf-to-pdfa"],
  ["pdf", "epub", "pdf/epub", "pdf-to-epub"],
  ["pdf", "azw3", "pdf/epub", "pdf-to-epub"],
  ["docx", "pdf", "file/pdf", "file-to-pdf"],
  ["doc", "pdf", "file/pdf", "file-to-pdf"],
  ["odt", "pdf", "file/pdf", "file-to-pdf"],
  ["xlsx", "pdf", "file/pdf", "file-to-pdf"],
  ["xls", "pdf", "file/pdf", "file-to-pdf"],
  ["ods", "pdf", "file/pdf", "file-to-pdf"],
  ["pptx", "pdf", "file/pdf", "file-to-pdf"],
  ["ppt", "pdf", "file/pdf", "file-to-pdf"],
  ["odp", "pdf", "file/pdf", "file-to-pdf"],
  ["rtf", "pdf", "file/pdf", "file-to-pdf"],
  ["txt", "pdf", "file/pdf", "file-to-pdf"],
  ["file-vsdx", "pdf", "file/pdf", "file-to-pdf"],
  ["html", "pdf", "html/pdf", "html-to-pdf"],
  ["zip", "pdf", "html/pdf", "html-to-pdf"],
  ["md", "pdf", "markdown/pdf", "markdown-to-pdf"],
  ["eml", "pdf", "eml/pdf", "eml-to-pdf"],
  ["msg", "pdf", "eml/pdf", "eml-to-pdf"],
  ["epub", "pdf", "ebook/pdf", "ebook-to-pdf"],
  ["mobi", "pdf", "ebook/pdf", "ebook-to-pdf"],
  ["azw3", "pdf", "ebook/pdf", "ebook-to-pdf"],
  ["fb2", "pdf", "ebook/pdf", "ebook-to-pdf"],
];

beforeEach(() => {
  api.post
    .mockReset()
    .mockResolvedValue({ data: new Blob(["converted"]), headers: {} });
});

describe("conversion batch routing", () => {
  test.each(CONVERSION_ROUTES)(
    "%s to %s processes each input through %s",
    async (fromExtension, toExtension, path, endpointName) => {
      const parameters = {
        ...defaultParameters,
        fromExtension,
        toExtension,
      };
      const files = ["first", "second"].map(
        (name) =>
          new File([name], `${name}.${fromExtension.replace("file-", "")}`),
      );

      const result = await convertProcessor(parameters, files);

      expect(result.files).toHaveLength(2);
      expect(api.post).toHaveBeenCalledTimes(2);
      for (let index = 0; index < files.length; index++) {
        const [url, form, config] = api.post.mock.calls[index];
        expect(url).toBe(`/api/v1/convert/${path}`);
        expect(config.endpointName).toBe(endpointName);
        expect(form.getAll("fileInput")).toEqual([files[index]]);
      }
    },
  );
});

test("mixed uploads use their own endpoint and retain existing PDFs", async () => {
  const types = ["docx", "eml", "html", "png", "epub", "md", "vsdx", "pdf"];
  const files = types.map((type) => new File([type], `input.${type}`));
  const result = await convertProcessor(
    {
      ...defaultParameters,
      fromExtension: "any",
      toExtension: "pdf",
      isSmartDetection: true,
      smartDetectionType: "mixed",
    },
    files,
  );

  expect(result.files).toHaveLength(files.length);
  expect(result.files.at(-1)).toBe(files.at(-1));
  const routes = [
    ["file/pdf", "file-to-pdf"],
    ["eml/pdf", "eml-to-pdf"],
    ["html/pdf", "html-to-pdf"],
    ["img/pdf", "img-to-pdf"],
    ["ebook/pdf", "ebook-to-pdf"],
    ["markdown/pdf", "markdown-to-pdf"],
    ["file/pdf", "file-to-pdf"],
  ];
  expect(api.post).toHaveBeenCalledTimes(routes.length);
  routes.forEach(([route, name], index) => {
    const [url, form, config] = api.post.mock.calls[index];
    expect(url).toBe(`/api/v1/convert/${route}`);
    expect(form.getAll("fileInput")).toEqual([files[index]]);
    expect(config.endpointName).toBe(name);
  });
  expect(api.post.mock.calls[1][1].get("includeAttachments")).not.toBeNull();
  expect(api.post.mock.calls[2][1].get("zoom")).not.toBeNull();
  expect(
    api.post.mock.calls[4][1].get("includeTableOfContents"),
  ).not.toBeNull();
});

test.each([
  ["pdf", "png"],
  ["pdf", "csv"],
  ["pdf", "pdfx"],
  ["pdf", "pdfua"],
  ["pdf", "cbz"],
  ["pdf", "cbr"],
  ["svg", "pdf"],
  ["cbz", "pdf"],
  ["cbr", "pdf"],
])("%s to %s processes every upload", async (fromExtension, toExtension) => {
  await convertProcessor(
    {
      ...defaultParameters,
      fromExtension,
      toExtension,
      imageOptions: { ...defaultParameters.imageOptions, combineImages: false },
    },
    [
      new File(["x"], `one.${fromExtension}`),
      new File(["y"], `two.${fromExtension}`),
    ],
  );
  expect(api.post).toHaveBeenCalledTimes(2);
  for (const [, form] of api.post.mock.calls) {
    expect(form.getAll("fileInput")).toHaveLength(1);
  }
});

test.each(["png", "image", "svg"])(
  "%s keeps combined-image requests",
  async (fromExtension) => {
    const files = [new File(["one"], "one.png"), new File(["two"], "two.png")];
    await convertProcessor(
      {
        ...defaultParameters,
        fromExtension,
        toExtension: "pdf",
        imageOptions: {
          ...defaultParameters.imageOptions,
          combineImages: true,
        },
      },
      files,
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][1].getAll("fileInput")).toEqual(files);
  },
);

test.each(["epub", "azw3"])(
  "%s output follows the selected target despite stale saved options",
  (toExtension) => {
    const data = buildConvertFormData(
      {
        ...defaultParameters,
        fromExtension: "pdf",
        toExtension,
        epubOptions: {
          detectChapters: false,
          targetDevice: "KINDLE_EINK_TEXT",
          outputFormat: toExtension === "azw3" ? "EPUB" : "AZW3",
        },
      },
      [new File(["pdf"], "one.pdf")],
    );
    expect(data.get("outputFormat")).toBe(
      toExtension === "azw3" ? "AZW3" : "EPUB",
    );
    expect(data.get("detectChapters")).toBe("false");
    expect(data.get("targetDevice")).toBe("KINDLE_EINK_TEXT");
  },
);

test.each([false, true])(
  "generic single uploads route by filename with smart detection %s",
  async (isSmartDetection) => {
    const file = new File(["email"], "message.eml");
    await convertProcessor(
      {
        ...defaultParameters,
        fromExtension: "any",
        toExtension: "pdf",
        isSmartDetection,
        smartDetectionType: isSmartDetection ? "mixed" : "none",
        emailOptions: {
          ...defaultParameters.emailOptions,
          includeAllRecipients: false,
        },
      },
      [file],
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, form, config] = api.post.mock.calls[0];
    expect(url).toBe("/api/v1/convert/eml/pdf");
    expect(config.endpointName).toBe("eml-to-pdf");
    expect(form.get("includeAllRecipients")).toBe("false");
  },
);
