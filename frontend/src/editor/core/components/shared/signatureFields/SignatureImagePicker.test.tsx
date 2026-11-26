import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { SignatureImagePicker } from "@editor/components/shared/signatureFields/SignatureImagePicker";

const saved = [
  { id: "a", label: "Drawn signature", dataUrl: "data:image/png;base64,AAAA" },
  { id: "b", label: "Initials", dataUrl: "data:image/png;base64,BBBB" },
];

function renderPicker(value?: File) {
  const onChange = vi.fn();
  const { container } = render(
    <MantineProvider>
      <SignatureImagePicker saved={saved} value={value} onChange={onChange} />
    </MantineProvider>,
  );
  return { onChange, container };
}

describe("SignatureImagePicker", () => {
  test("offers every saved signature beside the upload tile", () => {
    renderPicker();

    expect(
      screen.getByRole("button", { name: "Drawn signature" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Initials" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "certSign.appearance.graphic.upload",
      }),
    ).toBeTruthy();
  });

  test("reports an uploaded image", () => {
    const { onChange, container } = renderPicker();
    const file = new File(["x"], "seal.png", { type: "image/png" });

    const input =
      container.querySelector<HTMLInputElement>("input[type=file]")!;
    fireEvent.change(input, { target: { files: [file] } });

    expect(onChange).toHaveBeenCalledWith(file);
  });

  test("shows an uploaded image as the chosen tile", () => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:seal");
    globalThis.URL.revokeObjectURL = vi.fn();
    renderPicker(new File(["x"], "seal.png", { type: "image/png" }));

    expect(
      screen
        .getByRole("button", { name: "seal.png" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Drawn signature" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
