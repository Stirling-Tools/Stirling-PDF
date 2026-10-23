import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Location } from "react-router-dom";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import type { ToolId } from "@editor/types/toolId";
import { useNavigationUrlSync } from "@editor/hooks/useUrlSync";
import { EDITOR_BASENAME } from "@editor/routes/editorBasename";

const h = vi.hoisted(() => ({
  location: {
    pathname: "/scale-pages",
    search: "",
    hash: "",
    state: null,
    key: "scale",
  } as Location,
  navigate: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => h.location,
  useNavigate: () => h.navigate,
}));
vi.mock("@editor/utils/scarfTracking", () => ({ firePixel: vi.fn() }));
vi.mock("@editor/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { premiumEnabled: true } }),
}));

const registry = {
  sign: { name: "Sign", workbench: "viewer" },
  scalePages: { name: "Adjust page size and scale" },
} as ToolRegistry;

describe("useNavigationUrlSync router transitions", () => {
  beforeEach(() => {
    h.navigate.mockClear();
    h.location = { ...h.location, pathname: "/scale-pages", key: "scale" };
  });

  it("requests a guarded history navigation only once per visit", () => {
    const selectTool = vi.fn();
    const clearTool = vi.fn();
    const { rerender } = renderHook(() =>
      useNavigationUrlSync(
        "scalePages",
        (tool) => selectTool(tool),
        clearTool,
        registry,
      ),
    );

    h.location = { ...h.location, pathname: "/sign", key: "sign" };
    rerender();
    expect(selectTool).toHaveBeenCalledExactlyOnceWith("sign");

    // Opening the warning changes the callback without accepting the selection.
    rerender();
    rerender();
    expect(selectTool).toHaveBeenCalledTimes(1);

    h.location = { ...h.location, pathname: "/scale-pages", key: "scale" };
    rerender();
    h.location = { ...h.location, pathname: "/sign", key: "sign" };
    rerender();
    expect(selectTool).toHaveBeenCalledTimes(2);
    expect(clearTool).not.toHaveBeenCalled();
  });

  it.each([
    { selection: "sign" as ToolId | null, target: "/sign" },
    { selection: null, target: EDITOR_BASENAME },
  ])(
    "keeps the selection while $target is pending",
    ({ selection, target }) => {
      const selectTool = vi.fn();
      const clearTool = vi.fn();
      const { rerender } = renderHook(
        ({ selectedTool }: { selectedTool: ToolId | null }) =>
          useNavigationUrlSync(
            selectedTool,
            (tool) => selectTool(tool),
            clearTool,
            registry,
          ),
        { initialProps: { selectedTool: "scalePages" as ToolId | null } },
      );

      rerender({ selectedTool: selection });
      expect(h.navigate).toHaveBeenLastCalledWith(target);

      // A dirty-state update changes the guard callback before the router commits.
      rerender({ selectedTool: selection });
      rerender({ selectedTool: selection });
      expect(selectTool).not.toHaveBeenCalled();
      expect(clearTool).not.toHaveBeenCalled();

      h.location = { ...h.location, pathname: target, key: "destination" };
      rerender({ selectedTool: selection });
      expect(selectTool).not.toHaveBeenCalled();
      expect(clearTool).not.toHaveBeenCalled();

      h.location = { ...h.location, pathname: "/scale-pages", key: "scale" };
      rerender({ selectedTool: selection });
      expect(selectTool).toHaveBeenCalledExactlyOnceWith("scalePages");
    },
  );
});
