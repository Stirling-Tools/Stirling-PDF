import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { alert } = vi.hoisted(() => ({ alert: vi.fn() }));
vi.mock("@editor/components/toast", () => ({ alert }));
vi.mock("@editor/tools/pdfTextEditor/components/FontFamilySelect", () => ({
  FontFamilySelect: () => null,
}));

import { FormatGroup } from "@editor/tools/pdfTextEditor/components/toolbar/FormatGroup";
import type { Controller } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { EMPTY_TOOLBAR } from "@editor/tools/pdfTextEditor/util/toolbarState";
import type { ToolbarState } from "@editor/tools/pdfTextEditor/types";

const BLACK = { r: 0, g: 0, b: 0, a: 255 };
const RED = { r: 204, g: 0, b: 0, a: 255 };

function controller(
  fill: typeof BLACK,
  onChangeFill: (hex: string) => void,
): Controller {
  return {
    state: { ...EMPTY_TOOLBAR, fill, fontSize: 12 },
    scanFont: undefined,
    hasRunSelection: true,
    selectionTextReadOnly: false,
    onChangeFontFamily: vi.fn(),
    onChangeFontSize: vi.fn(),
    onChangeFill,
    onChangeOutline: vi.fn(),
    onToggleItalic: vi.fn(),
    onChangeCase: vi.fn(),
  } as unknown as Controller;
}

function formatGroup(fill: typeof BLACK, onChangeFill: (hex: string) => void) {
  return (
    <MantineProvider env="test">
      <FormatGroup controller={controller(fill, onChangeFill)} />
    </MantineProvider>
  );
}

describe("FormatGroup fill colour field", () => {
  it("keeps what the user is typing over when the toolbar catches up with an earlier pick", async () => {
    const user = userEvent.setup();
    const onChangeFill = vi.fn();
    const ui = (fill: typeof BLACK) => formatGroup(fill, onChangeFill);
    const { rerender } = render(ui(BLACK));
    const field = screen.getByTestId<HTMLInputElement>("pdf-editor-colour");
    act(() => field.focus());
    field.setSelectionRange(0, field.value.length);

    rerender(ui(RED));
    await user.paste("#0000cc");

    expect(field.value).toBe("#0000cc");
    expect(onChangeFill).toHaveBeenLastCalledWith("#0000cc");
  });

  it("shows the selection's colour again once the field loses focus", () => {
    const ui = (fill: typeof BLACK) => formatGroup(fill, vi.fn());
    const { rerender } = render(ui(BLACK));
    const field = screen.getByTestId<HTMLInputElement>("pdf-editor-colour");
    act(() => field.focus());
    rerender(ui(RED));
    expect(field.value).toBe("#000000");

    act(() => field.blur());
    expect(field.value).toBe("#cc0000");
  });
});

function styleController(
  state: Partial<ToolbarState>,
  actions: Partial<Controller> = {},
): Controller {
  return {
    ...controller(BLACK, vi.fn()),
    state: {
      ...EMPTY_TOOLBAR,
      fill: BLACK,
      fontSize: 12,
      ...state,
      mixed: { ...EMPTY_TOOLBAR.mixed, ...state.mixed },
    },
    onToggleBold: vi.fn(async () => null),
    onChangeFontWeight: vi.fn(async () => null),
    ...actions,
  };
}

function renderGroup(ctl: Controller) {
  return render(
    <MantineProvider env="test">
      <FormatGroup controller={ctl} />
    </MantineProvider>,
  );
}

describe("FormatGroup style toggles", () => {
  it("makes text bold from the Bold toggle beside Italic", async () => {
    const ctl = styleController({ canBold: true, canItalic: true });
    renderGroup(ctl);
    const bold = screen.getByTestId("pdf-editor-bold");

    expect(bold.nextElementSibling).toBe(
      screen.getByTestId("pdf-editor-italic"),
    );
    expect(bold).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(bold);

    expect(ctl.onToggleBold).toHaveBeenCalledTimes(1);
  });

  it("disables Bold and says why when the font has no bold face", async () => {
    renderGroup(styleController({ canBold: false }));
    const bold = screen.getByTestId("pdf-editor-bold");

    expect(bold).toBeDisabled();
    fireEvent.mouseEnter(bold);
    expect(
      await screen.findByText("pdfTextEditor.toolbar.boldUnavailable"),
    ).toBeInTheDocument();
  });

  it("says when only the bold italic face is missing", () => {
    renderGroup(
      styleController({
        italic: true,
        canItalic: true,
        canBold: false,
        boldNeedsBoldItalic: true,
      }),
    );

    fireEvent.mouseEnter(screen.getByTestId("pdf-editor-bold"));
    return expect(
      screen.findByText("pdfTextEditor.toolbar.noBoldItalic"),
    ).resolves.toBeInTheDocument();
  });

  it("says the same on Italic for bold text", () => {
    renderGroup(
      styleController({
        bold: true,
        canBold: true,
        canItalic: false,
        italicNeedsBoldItalic: true,
      }),
    );

    fireEvent.mouseEnter(screen.getByTestId("pdf-editor-italic"));
    return expect(
      screen.findByText("pdfTextEditor.toolbar.noBoldItalic"),
    ).resolves.toBeInTheDocument();
  });

  it("shows a bold-only font as bold, locked", () => {
    renderGroup(styleController({ bold: true, canBold: false }));
    const bold = screen.getByTestId("pdf-editor-bold");

    expect(bold).toBeDisabled();
    expect(bold).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a half-bold selection as mixed", () => {
    renderGroup(
      styleController({ canBold: true, mixed: { bold: true } as never }),
    );

    expect(screen.getByTestId("pdf-editor-bold")).toHaveAttribute(
      "aria-pressed",
      "mixed",
    );
  });

  it("tells the user when the italic toggle left text as it was", async () => {
    alert.mockReset();
    const ctl = styleController(
      { canItalic: true },
      { onToggleItalic: vi.fn(async () => "styleSkipped" as const) },
    );
    renderGroup(ctl);

    await userEvent.click(screen.getByTestId("pdf-editor-italic"));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith({
        alertType: "warning",
        expandable: false,
        title: "pdfTextEditor.fontPicker.styleSkipped",
      }),
    );
  });
});

describe("FormatGroup weight menu", () => {
  it("stays hidden for a family with only regular and bold", () => {
    renderGroup(styleController({ weights: [] }));

    expect(
      screen.queryByTestId("pdf-editor-font-weight"),
    ).not.toBeInTheDocument();
  });

  it("reaches a weight the toggles cannot", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const ctl = styleController({ weights: [300, 400, 700], weight: 400 });
    renderGroup(ctl);

    await userEvent.click(screen.getByTestId("pdf-editor-font-weight"));
    await userEvent.click(
      await screen.findByText("pdfTextEditor.fontPicker.weightLight"),
    );

    expect(ctl.onChangeFontWeight).toHaveBeenCalledWith(300);
  });
});
