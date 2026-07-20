import { useEffect, useState } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

vi.mock("@app/hooks/useSuperSearch", () => ({
  useSuperSearch: vi.fn(() => ({
    groups: [],
    flatResults: [],
    loadingFiles: false,
  })),
}));

vi.mock("@app/utils/hotkeys", () => ({
  isMacLike: () => false,
}));

import SuperSearch from "@app/components/shared/superSearch/SuperSearch";
import type {
  SuperSearchQueryOptions,
  SuperSearchScope,
} from "@app/hooks/useSuperSearch";

interface TestResult {
  key: string;
  group: string;
  title: string;
  subtitle?: string;
  score: number;
  onSelect: () => void | Promise<void>;
}

interface TestGroup {
  id: string;
  label: string;
  sectionLabel?: string;
  results: TestResult[];
}

interface TestUseResultsResult {
  groups: TestGroup[];
  flatResults: TestResult[];
  loadingFiles: boolean;
}

type TestUseResultsHook = (
  query: string,
  active: boolean,
  options?: SuperSearchQueryOptions,
) => TestUseResultsResult;

const TEST_SCOPES: SuperSearchScope[] = [
  {
    id: "portal-policies",
    label: "Policies",
    aliases: ["policy", "policies"],
  },
  {
    id: "portal-pipelines",
    label: "Pipelines",
    aliases: ["pipeline", "pipelines"],
  },
];

function makeResult(
  key: string,
  title: string,
  onSelect = vi.fn(),
): TestResult {
  return {
    key,
    group: "tools",
    title,
    score: 100,
    onSelect,
  };
}

function renderSearch(
  useResults?: TestUseResultsHook,
  scopes?: readonly SuperSearchScope[],
) {
  return render(
    <MantineProvider>
      <SuperSearch
        inputId="test-super-search"
        useResults={useResults as TestUseResultsHook | undefined}
        scopes={scopes}
      />
    </MantineProvider>,
  );
}

describe("SuperSearch", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 40,
      width: 320,
      height: 40,
      toJSON: () => "",
    } as DOMRect);

    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens from Ctrl+K based on e.code and exposes combobox wiring", async () => {
    const useResults: TestUseResultsHook = () => ({
      groups: [],
      flatResults: [],
      loadingFiles: false,
    });

    renderSearch(useResults);

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(document.body, {
      ctrlKey: true,
      code: "KeyK",
      key: "x",
    });

    await waitFor(() => {
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute("aria-expanded", "true");
    });

    expect(input).toHaveAttribute("aria-controls", "test-super-search-listbox");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("keeps the highlight on the same result key when async results reorder", async () => {
    const alphaSelect = vi.fn();
    const betaSelect = vi.fn();

    const useAsyncResults: TestUseResultsHook = (query, active) => {
      const [swapped, setSwapped] = useState(false);

      useEffect(() => {
        if (!active || !query.trim()) {
          setSwapped(false);
          return;
        }

        const timeoutId = window.setTimeout(() => setSwapped(true), 50);
        return () => window.clearTimeout(timeoutId);
      }, [active, query]);

      const results = swapped
        ? [
            makeResult("beta", "Beta", betaSelect),
            makeResult("alpha", "Alpha", alphaSelect),
          ]
        : [
            makeResult("alpha", "Alpha", alphaSelect),
            makeResult("beta", "Beta", betaSelect),
          ];
      const groups = query.trim()
        ? [{ id: "tools", label: "Tools", results }]
        : [];

      return {
        groups,
        flatResults: groups.flatMap((group) => group.results),
        loadingFiles: false,
      };
    };

    renderSearch(useAsyncResults);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a" } });

    await screen.findByText("Alpha");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "test-super-search-option-1",
    );

    await waitFor(() => {
      expect(input).toHaveAttribute(
        "aria-activedescendant",
        "test-super-search-option-0",
      );
    });

    expect(screen.getByText("Beta").closest('[role="option"]')).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.keyDown(input, { key: "Enter" });

    expect(betaSelect).toHaveBeenCalledTimes(1);
    expect(alphaSelect).not.toHaveBeenCalled();
  });

  it("supports multi-select scope chips and clears manual filters on close", async () => {
    const useScopedResults: TestUseResultsHook = (query, active, options) => {
      if (!active || !query.trim()) {
        return { groups: [], flatResults: [], loadingFiles: false };
      }

      const enabledScopes = new Set(options?.scopeIds ?? []);
      const allGroups: TestGroup[] = [
        {
          id: "portal-policies",
          label: "Policies",
          results: [makeResult("policy", "Policy Match")],
        },
        {
          id: "portal-pipelines",
          label: "Pipelines",
          results: [makeResult("pipeline", "Pipeline Match")],
        },
      ];
      const groups =
        enabledScopes.size === 0
          ? allGroups
          : allGroups.filter((group) => enabledScopes.has(group.id));

      return {
        groups,
        flatResults: groups.flatMap((group) => group.results),
        loadingFiles: false,
      };
    };

    renderSearch(useScopedResults, TEST_SCOPES);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "invoice" } });

    await screen.findByText("Policy Match");
    expect(screen.getByText("Pipeline Match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Policies" }));
    await waitFor(() => {
      expect(screen.getByText("Policy Match")).toBeInTheDocument();
      expect(screen.queryByText("Pipeline Match")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Pipelines" }));
    await waitFor(() => {
      expect(screen.getByText("Policy Match")).toBeInTheDocument();
      expect(screen.getByText("Pipeline Match")).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "false");
    });

    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getByText("Policy Match")).toBeInTheDocument();
      expect(screen.getByText("Pipeline Match")).toBeInTheDocument();
    });
  });

  it("maps scope prefixes onto active chips and lets the chip remove them", async () => {
    const useScopedResults: TestUseResultsHook = (query, active, options) => {
      if (!active || !query.trim()) {
        return { groups: [], flatResults: [], loadingFiles: false };
      }

      const enabledScopes = new Set(options?.scopeIds ?? []);
      const groups: TestGroup[] = [
        {
          id: "portal-policies",
          label: "Policies",
          results: [makeResult("policy", "Policy Match")],
        },
        {
          id: "portal-pipelines",
          label: "Pipelines",
          results: [makeResult("pipeline", "Pipeline Match")],
        },
      ].filter(
        (group) => enabledScopes.size === 0 || enabledScopes.has(group.id),
      );

      return {
        groups,
        flatResults: groups.flatMap((group) => group.results),
        loadingFiles: false,
      };
    };

    renderSearch(useScopedResults, TEST_SCOPES);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "policy: invoice" } });

    await waitFor(() => {
      expect(screen.getByText("Policy Match")).toBeInTheDocument();
      expect(screen.queryByText("Pipeline Match")).not.toBeInTheDocument();
    });

    const policyChip = screen.getByRole("button", { name: "Policies" });
    expect(policyChip).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(policyChip);

    await waitFor(() => {
      expect(input).toHaveValue("invoice");
      expect(screen.getByText("Policy Match")).toBeInTheDocument();
      expect(screen.getByText("Pipeline Match")).toBeInTheDocument();
    });
  });

  it("shows no-results below scoped filters before typing", async () => {
    const useResults: TestUseResultsHook = () => ({
      groups: [],
      flatResults: [],
      loadingFiles: false,
    });

    renderSearch(useResults, TEST_SCOPES);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Policies" }),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Type to search")).not.toBeInTheDocument();
    expect(screen.getByText("search.noResults")).toBeInTheDocument();
  });

  it("renders shared section headers once for consecutive groups", async () => {
    const useResults: TestUseResultsHook = (query) => {
      if (!query.trim()) {
        return { groups: [], flatResults: [], loadingFiles: false };
      }

      const groups: TestGroup[] = [
        {
          id: "portal-users",
          label: "Users",
          sectionLabel: "Processor",
          results: [makeResult("user", "Alice")],
        },
        {
          id: "portal-policies",
          label: "Policies",
          sectionLabel: "Processor",
          results: [makeResult("policy", "Security Policy")],
        },
        {
          id: "tools",
          label: "Tools",
          sectionLabel: "Editor",
          results: [makeResult("tool", "Merge PDFs")],
        },
      ];

      return {
        groups,
        flatResults: groups.flatMap((group) => group.results),
        loadingFiles: false,
      };
    };

    renderSearch(useResults);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a" } });

    await screen.findByText("Alice");

    expect(screen.getAllByText("Processor")).toHaveLength(1);
    expect(screen.getAllByText("Editor")).toHaveLength(1);
  });

  it("caps a large group behind show-more and expands/collapses it", async () => {
    const titles = Array.from({ length: 8 }, (_, i) => `Tool ${i + 1}`);
    const useResults: TestUseResultsHook = (query) => {
      if (!query.trim()) {
        return { groups: [], flatResults: [], loadingFiles: false };
      }
      const groups: TestGroup[] = [
        {
          id: "tools",
          label: "Tools",
          results: titles.map((title, i) => makeResult(`tool-${i}`, title)),
        },
      ];
      return {
        groups,
        flatResults: groups.flatMap((group) => group.results),
        loadingFiles: false,
      };
    };

    renderSearch(useResults);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "tool" } });

    await screen.findByText("Tool 1");
    expect(screen.getByText("Tool 5")).toBeInTheDocument();
    expect(screen.queryByText("Tool 6")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", {
      name: /superSearch\.showMore/,
    });
    fireEvent.click(toggle);

    await screen.findByText("Tool 8");
    expect(
      screen.getByRole("button", { name: /superSearch\.showLess/ }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /superSearch\.showLess/ }),
    );
    await waitFor(() => {
      expect(screen.queryByText("Tool 6")).not.toBeInTheDocument();
      expect(screen.getByText("Tool 5")).toBeInTheDocument();
    });
  });

  it("shows a cap+1 group in full with no show-more toggle", async () => {
    const useResults: TestUseResultsHook = (query) => {
      if (!query.trim()) {
        return { groups: [], flatResults: [], loadingFiles: false };
      }
      const groups: TestGroup[] = [
        {
          id: "tools",
          label: "Tools",
          results: Array.from({ length: 6 }, (_, i) =>
            makeResult(`tool-${i}`, `Tool ${i + 1}`),
          ),
        },
      ];
      return {
        groups,
        flatResults: groups.flatMap((group) => group.results),
        loadingFiles: false,
      };
    };

    renderSearch(useResults);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "tool" } });

    await screen.findByText("Tool 6");
    expect(
      screen.queryByRole("button", { name: /superSearch\.show/ }),
    ).not.toBeInTheDocument();
  });

  it("lets a section collapse and reopen without hiding the other section", async () => {
    const useResults: TestUseResultsHook = (query) => {
      if (!query.trim()) {
        return { groups: [], flatResults: [], loadingFiles: false };
      }

      const groups: TestGroup[] = [
        {
          id: "portal-users",
          label: "Users",
          sectionLabel: "Processor",
          results: [makeResult("user", "Alice")],
        },
        {
          id: "tools",
          label: "Tools",
          sectionLabel: "Editor",
          results: [makeResult("tool", "Merge PDFs")],
        },
      ];

      return {
        groups,
        flatResults: groups.flatMap((group) => group.results),
        loadingFiles: false,
      };
    };

    renderSearch(useResults);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a" } });

    await screen.findByText("Alice");
    const processorToggle = screen.getByRole("button", { name: "Processor" });

    expect(processorToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Merge PDFs")).toBeInTheDocument();

    fireEvent.click(processorToggle);

    await waitFor(() => {
      expect(processorToggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
      expect(screen.getByText("Merge PDFs")).toBeInTheDocument();
    });

    fireEvent.click(processorToggle);

    await waitFor(() => {
      expect(processorToggle).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
  });
});
