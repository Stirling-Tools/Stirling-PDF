/** `toolEndpointPath` is the seam that lets the boot registry stay free of the operation configs: a registry. */
import { describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { withOperationConfigs } from "@app/data/toolOperationConfigs";
import { useTranslatedToolCatalog } from "@app/data/useTranslatedToolRegistry";
import { toolEndpointPath } from "@app/constants/toolEndpoints";
import { TOOL_ENDPOINTS } from "@app/types/toolApiTypes";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { changeLanguage: vi.fn(), language: "en-US" },
  }),
  Trans: ({ children }: { children?: unknown }) => children,
}));

describe("toolEndpointPath", () => {
  test("agrees with each tool's own operation config endpoint", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());
    const allTools = withOperationConfigs(result.current.allTools);

    // Only the configs that name one fixed endpoint can be compared; convert's endpoint is a
    // function of the chosen formats, so its paths come from the conversion table instead.
    const mismatches: string[] = [];
    for (const [id, entry] of Object.entries(allTools)) {
      const configured = entry?.operationConfig?.endpoint;
      if (typeof configured !== "string") continue;
      const resolved = toolEndpointPath(entry?.endpoints?.[0]);
      if (resolved !== configured) {
        mismatches.push(
          `${id}: ${entry?.endpoints?.[0]} -> ${resolved}, config says ${configured}`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  });

  // Some registry entries name surfaces no operation addresses (`view-pdf`, the developer docs links), so a name.
  test("only resolves names to generated endpoints", () => {
    const { result } = renderHook(() => useTranslatedToolCatalog());
    const generated: ReadonlySet<string> = new Set(TOOL_ENDPOINTS);

    const invented: string[] = [];
    for (const [id, entry] of Object.entries(result.current.allTools)) {
      for (const name of entry?.endpoints ?? []) {
        const resolved = toolEndpointPath(name);
        if (resolved && !generated.has(resolved)) {
          invented.push(`${id}: ${name} -> ${resolved}`);
        }
      }
    }

    expect(invented).toEqual([]);
  });

  test("resolves names whose path does not end with them", () => {
    // Registered names that are not the last segment of the path they address.
    expect(toolEndpointPath("form-detection")).toBe(
      "/api/v1/form/form-detection/detect",
    );
    expect(toolEndpointPath("overlay-pdf")).toBe(
      "/api/v1/general/overlay-pdfs",
    );
    // A conversion key, whose ENDPOINT_NAMES value is the unrelated "text-editor-to-pdf".
    expect(toolEndpointPath("text-editor-pdf")).toBe(
      "/api/v1/convert/text-editor/pdf",
    );
    // A conversion *name* addresses a path only the convert tool knows (it resolves its
    // endpoint from the chosen formats), so it stays unresolved here.
    expect(toolEndpointPath("pdf-to-img")).toBeUndefined();
  });

  test("passes a path through unchanged", () => {
    expect(toolEndpointPath("/api/v1/misc/compress-pdf")).toBe(
      "/api/v1/misc/compress-pdf",
    );
    expect(toolEndpointPath(undefined)).toBeUndefined();
  });
});
