// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { pageSetupRequest } from "@editor/tools/pdfTextEditor/store/pageSetupRequest";

const first = {} as EditorDocument;
const second = {} as EditorDocument;

afterEach(() => pageSetupRequest.close());

test("a page setup request opened on one document does not apply to another", () => {
  pageSetupRequest.open({
    document: first,
    pageIndex: 3,
    clientX: 10,
    clientY: 20,
  });
  expect(pageSetupRequest.for(first)?.pageIndex).toBe(3);
  expect(pageSetupRequest.for(second)).toBeNull();
  expect(pageSetupRequest.for(null)).toBeNull();
});
