import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  convertFromApiParams,
  convertProcessor,
  convertToApiParams,
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

const OFFICE_ROUTES = [
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

describe.each([true, false, undefined])(
  "Office conversion requests with choice %s",
  (choice) => {
    test.each(OFFICE_ROUTES)(
      "%s to %s sends the selected Office engine to %s",
      async (fromExtension, toExtension, path, endpointName) => {
        const parameters = {
          ...defaultParameters,
          fromExtension,
          toExtension,
          useStirlingOfficeConvert: choice,
        };
        const files = ["first"].map(
          (name) =>
            new File([name], `${name}.${fromExtension.replace("file-", "")}`),
        );

        const result = await convertProcessor(parameters, files);

        expect(result.files).toHaveLength(1);
        expect(api.post).toHaveBeenCalledTimes(1);
        for (let index = 0; index < files.length; index++) {
          const [url, form, config] = api.post.mock.calls[index];
          expect(url).toBe(`/api/v1/convert/${path}`);
          expect(config.endpointName).toBe(endpointName);
          expect(form.getAll("fileInput")).toEqual([files[index]]);
          expect(form.get("useStirlingOfficeConvert")).toBe(
            choice === undefined ? null : String(choice),
          );
        }

        const saved = convertToApiParams(parameters);
        expect(convertFromApiParams(saved).useStirlingOfficeConvert).toBe(
          choice,
        );
        if (choice !== undefined) {
          expect(
            convertFromApiParams(
              Object.assign(saved, { useStirlingOfficeConvert: choice }),
            ).useStirlingOfficeConvert,
          ).toBe(choice);
        }
      },
    );
  },
);
