import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { TextSelectionMenu } from "@app/components/viewer/TextSelectionMenu";
import { PdfAnnotationSubtype } from "@embedpdf/models";

// Mock i18next
const mockT = vi.fn(
  (key: string, fallback?: string) => fallback || `mock-${key}`,
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Mock EmbedPDF hooks
const mockCopyToClipboard = vi.fn();
const mockGetFormattedSelection = vi.fn();
const mockGetSelectedText = vi.fn();
const mockClearSelection = vi.fn();

vi.mock("@embedpdf/plugin-selection/react", () => ({
  useSelectionCapability: () => ({
    provides: {
      copyToClipboard: mockCopyToClipboard,
      getFormattedSelection: mockGetFormattedSelection,
      getSelectedText: mockGetSelectedText,
      clear: mockClearSelection,
    },
  }),
}));

const mockCreateAnnotation = vi.fn();
vi.mock("@embedpdf/plugin-annotation/react", () => ({
  useAnnotation: () => ({
    state: {},
    provides: {
      createAnnotation: mockCreateAnnotation,
    },
  }),
}));

const mockQueueCurrentSelectionAsPending = vi.fn();
vi.mock("@embedpdf/plugin-redaction/react", () => ({
  useRedaction: () => ({
    state: {},
    provides: {
      queueCurrentSelectionAsPending: mockQueueCurrentSelectionAsPending,
    },
  }),
}));

vi.mock("@app/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => "doc-1",
}));

const mockHandleToolSelectForced = vi.fn();
const mockSetSidebarsVisible = vi.fn();
const mockSetLeftPanelView = vi.fn();
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({
    handleToolSelectForced: mockHandleToolSelectForced,
    setSidebarsVisible: mockSetSidebarsVisible,
    setLeftPanelView: mockSetLeftPanelView,
  }),
}));

const mockSetRedactionMode = vi.fn();
const mockActivateRedact = vi.fn();
const mockSetRedactionConfig = vi.fn();
vi.mock("@app/contexts/RedactionContext", () => ({
  useRedaction: () => ({
    setRedactionMode: mockSetRedactionMode,
    activateRedact: mockActivateRedact,
    setRedactionConfig: mockSetRedactionConfig,
    redactionApiRef: { current: null },
  }),
}));

const mockSetToolAndWorkbench = vi.fn();
const mockSetHasUnsavedChanges = vi.fn();
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({
    actions: {
      setToolAndWorkbench: mockSetToolAndWorkbench,
      setHasUnsavedChanges: mockSetHasUnsavedChanges,
    },
  }),
}));

const mockAlert = vi.fn();
vi.mock("@app/components/toast", () => ({
  alert: (options: any) => mockAlert(options),
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe("TextSelectionMenu", () => {
  const defaultProps = {
    rect: { origin: { x: 100, y: 100 }, size: { width: 80, height: 20 } },
    menuWrapperProps: {
      style: {},
      ref: vi.fn(),
    },
    selected: true,
    placement: {
      pageIndex: 0,
      rect: { origin: { x: 100, y: 100 }, size: { width: 80, height: 20 } },
      spaceAbove: 100,
      spaceBelow: 200,
      suggestTop: true,
      isVisible: true,
    },
    context: {
      type: "selection" as const,
      pageIndex: 0,
    },
    documentId: "doc-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFormattedSelection.mockReturnValue([
      {
        pageIndex: 0,
        rect: { origin: { x: 100, y: 100 }, size: { width: 80, height: 20 } },
        segmentRects: [
          { origin: { x: 100, y: 100 }, size: { width: 80, height: 20 } },
        ],
      },
    ]);
  });

  test("renders all 7 action buttons when selected", () => {
    render(
      <TestWrapper>
        <TextSelectionMenu {...defaultProps} />
      </TestWrapper>,
    );

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Highlight" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Strikeout" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Underline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Squiggly" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add link" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redact" })).toBeInTheDocument();
  });

  test("does not render portal content when selected is false", () => {
    render(
      <TestWrapper>
        <TextSelectionMenu {...defaultProps} selected={false} />
      </TestWrapper>,
    );

    expect(
      screen.queryByRole("button", { name: "Copy" }),
    ).not.toBeInTheDocument();
  });

  test("calls copyToClipboard, clears selection, and triggers toast popup when Copy button is clicked", () => {
    render(
      <TestWrapper>
        <TextSelectionMenu {...defaultProps} />
      </TestWrapper>,
    );

    const copyBtn = screen.getByRole("button", { name: "Copy" });
    fireEvent.click(copyBtn);

    expect(mockCopyToClipboard).toHaveBeenCalledWith("doc-1");
    expect(mockClearSelection).toHaveBeenCalledWith("doc-1");
    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "neutral",
        title: "Copied to clipboard",
        durationMs: 2000,
      }),
    );
  });

  test("creates HIGHLIGHT annotation, clears selection and opens Annotate UI when Highlight button is clicked", () => {
    render(
      <TestWrapper>
        <TextSelectionMenu {...defaultProps} />
      </TestWrapper>,
    );

    const highlightBtn = screen.getByRole("button", { name: "Highlight" });
    fireEvent.click(highlightBtn);

    expect(mockCreateAnnotation).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        type: PdfAnnotationSubtype.HIGHLIGHT,
        color: "#FFCD45",
        pageIndex: 0,
      }),
    );
    expect(mockClearSelection).toHaveBeenCalledWith("doc-1");
    expect(mockHandleToolSelectForced).toHaveBeenCalledWith("annotate");
    expect(mockSetSidebarsVisible).toHaveBeenCalledWith(true);
    expect(mockSetLeftPanelView).toHaveBeenCalledWith("toolContent");
  });

  test("creates STRIKEOUT annotation, clears selection and opens Annotate UI when Strikeout button is clicked", () => {
    render(
      <TestWrapper>
        <TextSelectionMenu {...defaultProps} />
      </TestWrapper>,
    );

    const strikeoutBtn = screen.getByRole("button", { name: "Strikeout" });
    fireEvent.click(strikeoutBtn);

    expect(mockCreateAnnotation).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        type: PdfAnnotationSubtype.STRIKEOUT,
        color: "#E44234",
        pageIndex: 0,
      }),
    );
    expect(mockClearSelection).toHaveBeenCalledWith("doc-1");
    expect(mockHandleToolSelectForced).toHaveBeenCalledWith("annotate");
  });

  test("creates UNDERLINE annotation, clears selection and opens Annotate UI when Underline button is clicked", () => {
    render(
      <TestWrapper>
        <TextSelectionMenu {...defaultProps} />
      </TestWrapper>,
    );

    const underlineBtn = screen.getByRole("button", { name: "Underline" });
    fireEvent.click(underlineBtn);

    expect(mockCreateAnnotation).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        type: PdfAnnotationSubtype.UNDERLINE,
        color: "#E44234",
        pageIndex: 0,
      }),
    );
    expect(mockClearSelection).toHaveBeenCalledWith("doc-1");
    expect(mockHandleToolSelectForced).toHaveBeenCalledWith("annotate");
  });

  test("creates SQUIGGLY annotation, clears selection and opens Annotate UI when Squiggly button is clicked", () => {
    render(
      <TestWrapper>
        <TextSelectionMenu {...defaultProps} />
      </TestWrapper>,
    );

    const squigglyBtn = screen.getByRole("button", { name: "Squiggly" });
    fireEvent.click(squigglyBtn);

    expect(mockCreateAnnotation).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        type: PdfAnnotationSubtype.SQUIGGLY,
        color: "#E44234",
        pageIndex: 0,
      }),
    );
    expect(mockClearSelection).toHaveBeenCalledWith("doc-1");
    expect(mockHandleToolSelectForced).toHaveBeenCalledWith("annotate");
  });

  test("opens link popover and creates LINK annotation upon submit", () => {
    render(
      <TestWrapper>
        <TextSelectionMenu {...defaultProps} />
      </TestWrapper>,
    );

    const linkBtn = screen.getByRole("button", { name: "Add link" });
    fireEvent.click(linkBtn);

    const input = screen.getByPlaceholderText("https://...");
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "https://example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockCreateAnnotation).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        type: PdfAnnotationSubtype.LINK,
        target: {
          type: "action",
          action: { type: 3, uri: "https://example.com" },
        },
      }),
    );
    expect(mockClearSelection).toHaveBeenCalledWith("doc-1");
    expect(mockHandleToolSelectForced).toHaveBeenCalledWith("annotate");
  });

  test("creates REDACT annotation, marks unsaved changes, and opens Redact UI when Redact button is clicked", () => {
    mockGetFormattedSelection.mockReturnValue([
      {
        pageIndex: 0,
        rect: { origin: { x: 10, y: 10 }, size: { width: 100, height: 20 } },
        segmentRects: [],
      },
    ]);

    render(
      <TestWrapper>
        <TextSelectionMenu {...defaultProps} />
      </TestWrapper>,
    );

    const redactBtn = screen.getByRole("button", { name: "Redact" });
    fireEvent.click(redactBtn);

    expect(mockCreateAnnotation).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        type: PdfAnnotationSubtype.REDACT,
      }),
    );
    expect(mockClearSelection).toHaveBeenCalledWith("doc-1");
    expect(mockSetHasUnsavedChanges).toHaveBeenCalledWith(true);
    expect(mockSetRedactionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "manual" }),
    );
    expect(mockSetToolAndWorkbench).toHaveBeenCalledWith("redact", "viewer");
    expect(mockSetSidebarsVisible).toHaveBeenCalledWith(true);
    expect(mockSetLeftPanelView).toHaveBeenCalledWith("toolContent");
    expect(mockSetRedactionMode).toHaveBeenCalledWith(true);
  });
});
