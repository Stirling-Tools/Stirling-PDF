import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MantineProvider } from "@mantine/core";

// Mock i18n so assertions can rely on the English default strings.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

// Isolate FileListArea's branching logic from its heavy children — we only
// care which state it renders, not how each child looks.
vi.mock("@app/components/fileManager/EmptyFilesState", () => ({
  default: () => <div>No recent files</div>,
}));
vi.mock("@app/components/fileManager/FileListItem", () => ({
  default: ({ file }: { file: { name: string } }) => <div>{file.name}</div>,
}));
vi.mock("@app/components/fileManager/FileHistoryGroup", () => ({
  default: () => null,
}));
vi.mock("@app/ui/Button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

const contextValue = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock("@app/contexts/FileManagerContext", () => ({
  useFileManagerContext: () => contextValue.current,
}));

import FileListArea from "@app/components/fileManager/FileListArea";

function baseContext(overrides: Record<string, unknown>) {
  return {
    activeSource: "recent",
    recentFiles: [],
    filteredFiles: [],
    selectedFilesSet: new Set(),
    expandedFileIds: new Set(),
    loadedHistoryFiles: new Map(),
    onFileSelect: vi.fn(),
    onFileRemove: vi.fn(),
    onHistoryFileRemove: vi.fn(),
    onFileDoubleClick: vi.fn(),
    onDownloadSingle: vi.fn(),
    isLoading: false,
    loadError: false,
    activeFileIds: [],
    refreshRecentFiles: vi.fn(),
    ...overrides,
  };
}

describe("FileListArea recent-files states", () => {
  beforeEach(() => {
    contextValue.current = baseContext({});
  });

  it("shows the empty state when there are no files and no error", () => {
    contextValue.current = baseContext({ isLoading: false, loadError: false });
    render(
      <MantineProvider>
        <FileListArea scrollAreaHeight="200px" />
      </MantineProvider>,
    );
    expect(screen.getByText("No recent files")).toBeInTheDocument();
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("shows the loading state while loading with no files yet", () => {
    contextValue.current = baseContext({ isLoading: true });
    render(
      <MantineProvider>
        <FileListArea scrollAreaHeight="200px" />
      </MantineProvider>,
    );
    expect(screen.getByText("Loading files...")).toBeInTheDocument();
    expect(screen.queryByText("No recent files")).not.toBeInTheDocument();
  });

  it("shows an error state with a retry action when the load fails (not the empty state)", () => {
    const refreshRecentFiles = vi.fn();
    contextValue.current = baseContext({
      isLoading: false,
      loadError: true,
      refreshRecentFiles,
    });
    render(
      <MantineProvider>
        <FileListArea scrollAreaHeight="200px" />
      </MantineProvider>,
    );

    // The failed load must be visually distinct from a genuinely empty history.
    expect(
      screen.getByText("Couldn't load your recent files"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No recent files")).not.toBeInTheDocument();

    const retry = screen.getByText("Try again");
    fireEvent.click(retry);
    expect(refreshRecentFiles).toHaveBeenCalledTimes(1);
  });

  it("renders the file list when files are present even if a partial load error occurred", () => {
    contextValue.current = baseContext({
      recentFiles: [{ id: "a" }],
      filteredFiles: [{ id: "a", name: "doc.pdf" }],
      loadError: true,
    });
    render(
      <MantineProvider>
        <FileListArea scrollAreaHeight="200px" />
      </MantineProvider>,
    );
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load your recent files"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No recent files")).not.toBeInTheDocument();
  });
});
