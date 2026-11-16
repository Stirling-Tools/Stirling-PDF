import { MantineProvider } from "@mantine/core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@editor/tools/pdfTextEditor/components/FontFamilySelect", () => ({
  FontFamilySelect: () => null,
}));

import { FormatGroup } from "@editor/tools/pdfTextEditor/components/toolbar/FormatGroup";
import type { Controller } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { EMPTY_TOOLBAR } from "@editor/tools/pdfTextEditor/util/toolbarState";

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

describe("FormatGroup fill colour field", () => {
  it("keeps what the user is typing over when the toolbar catches up with an earlier pick", async () => {
    const user = userEvent.setup();
    const onChangeFill = vi.fn();
    const ui = (fill: typeof BLACK) => (
      <MantineProvider env="test">
        <FormatGroup controller={controller(fill, onChangeFill)} />
      </MantineProvider>
    );
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
    const ui = (fill: typeof BLACK) => (
      <MantineProvider env="test">
        <FormatGroup controller={controller(fill, vi.fn())} />
      </MantineProvider>
    );
    const { rerender } = render(ui(BLACK));
    const field = screen.getByTestId<HTMLInputElement>("pdf-editor-colour");
    act(() => field.focus());
    rerender(ui(RED));
    expect(field.value).toBe("#000000");

    act(() => field.blur());
    expect(field.value).toBe("#cc0000");
  });
});
