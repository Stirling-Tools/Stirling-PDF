import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ChangePopover } from "@editor/tools/pdfTextEditor/components/inspector/ChangeControls";
import {
  isChangePreviewOpen,
  isModalOpen,
} from "@editor/tools/pdfTextEditor/util/dom";

function preview(opened: boolean) {
  return (
    <MantineProvider env="test">
      <ChangePopover opened={opened} anchor={<span>Fonts</span>} label="Fonts">
        <button type="button">Done</button>
      </ChangePopover>
    </MantineProvider>
  );
}

it("holds the editor as a named modal dialog only while a change previews", async () => {
  const { rerender } = render(preview(true));

  expect(await screen.findByRole("dialog", { name: "Fonts" })).toHaveAttribute(
    "aria-modal",
    "true",
  );
  expect(isModalOpen()).toBe(true);
  expect(isChangePreviewOpen()).toBe(true);

  rerender(preview(false));

  expect(isChangePreviewOpen()).toBe(false);
});
