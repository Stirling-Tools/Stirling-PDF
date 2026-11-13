import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FontFamilySelect } from "@editor/tools/pdfTextEditor/components/FontFamilySelect";

describe("font picker document font", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("offers the PDF's own font again once the text was changed away from it", async () => {
    const onChange = vi.fn();
    render(
      <MantineProvider env="test">
        <FontFamilySelect
          value="Helvetica"
          documentFontId="pdf:7:Garamond"
          onChange={onChange}
        />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByTestId("pdf-editor-font-family"));
    fireEvent.click(await screen.findByText("Garamond"));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("pdf:7:Garamond"),
    );
  });
});
