import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LibraryToolbar } from "@editor/components/filesPage/LibraryToolbar";
import type { FilesPageOriginFilter } from "@editor/contexts/FilesPageContext";

const policy = vi.hoisted(() => ({ localOnly: false }));
vi.mock("@editor/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => policy.localOnly,
}));
vi.mock("@mantine/core", () => ({
  Select: () => null,
  MultiSelect: () => null,
}));
vi.mock("@editor/ui/SegmentedControl", () => ({
  SegmentedControl: () => null,
}));
vi.mock("@editor/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@editor/components/filesPage/FilesToolbarFilterMenu", () => ({
  FilesToolbarFilterMenu: () => null,
}));
vi.mock("@editor/components/filesPage/FilesToolbarSortMenu", () => ({
  FilesToolbarSortMenu: () => null,
}));
vi.mock("@editor/components/filesPage/FilenameSearch", () => ({
  FilenameSearch: () => null,
}));

beforeEach(() => {
  policy.localOnly = false;
});

it.each<FilesPageOriginFilter>(["cloud", "shared-with-me", "local", "all"])(
  "clears only hidden source filters when privacy mode starts (%s)",
  (originFilter) => {
    const setOriginFilter = vi.fn();
    const toolbar = (
      <LibraryToolbar
        isMobile={false}
        availableTypes={[]}
        originFilter={originFilter}
        setOriginFilter={setOriginFilter}
        typeFilter={[]}
        setTypeFilter={() => {}}
        search=""
        setSearch={() => {}}
        sortMode="modified-desc"
        setSortMode={() => {}}
        viewMode="grid"
        setViewMode={() => {}}
      />
    );
    const { rerender } = render(toolbar);
    expect(setOriginFilter).not.toHaveBeenCalled();
    policy.localOnly = true;
    rerender(<LibraryToolbar {...toolbar.props} />);
    if (originFilter === "cloud" || originFilter === "shared-with-me") {
      expect(setOriginFilter).toHaveBeenCalledWith("all");
    } else {
      expect(setOriginFilter).not.toHaveBeenCalled();
    }
  },
);
