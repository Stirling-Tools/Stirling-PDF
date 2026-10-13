import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  localOnly: true,
  status: {} as Record<string, boolean>,
}));
vi.mock("@app/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => state.localOnly,
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useMultipleEndpointsEnabled: () => ({ endpointStatus: state.status }),
}));
vi.mock("@core/data/useTranslatedToolRegistry", () => {
  const tools = {
    merge: { name: "Merge", endpoints: ["merge-pdfs"] },
    ocr: { name: "OCR", endpoints: ["ocr-pdf"] },
    convert: { name: "Convert", endpoints: ["pdf-to-img", "pdf-to-word"] },
  };
  const catalog = {
    allTools: tools,
    regularTools: tools,
    superTools: {},
    linkTools: {},
  };
  return { useTranslatedToolCatalog: () => catalog };
});
import { useTranslatedToolCatalog } from "@app/data/useTranslatedToolRegistry";
import { filterToolRegistryByQuery } from "@app/utils/toolSearch";

test("catalogue and search hide unavailable tools but keep conversions with a local format", () => {
  state.localOnly = true;
  state.status = {};
  const { result, rerender } = renderHook(useTranslatedToolCatalog);
  expect(filterToolRegistryByQuery(result.current.regularTools, "")).toEqual(
    [],
  );
  state.status = {
    "merge-pdfs": true,
    "ocr-pdf": false,
    "pdf-to-img": true,
    "pdf-to-word": false,
  };
  rerender();
  expect(
    filterToolRegistryByQuery(result.current.regularTools, "").map(
      ({ item }) => item[0],
    ),
  ).toEqual(["merge", "convert"]);
  expect(
    filterToolRegistryByQuery(result.current.regularTools, "OCR").map(
      ({ item }) => item[0],
    ),
  ).not.toContain("ocr");
  state.localOnly = false;
  rerender();
  expect(
    filterToolRegistryByQuery(result.current.regularTools, "OCR").map(
      ({ item }) => item[0],
    ),
  ).toContain("ocr");
});
