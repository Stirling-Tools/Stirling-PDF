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
  const onAdd = vi.fn();
  render(
    <MantineProvider>
      <SignatureImagePicker
        saved={saved}
        value={value}
        onChange={onChange}
        onAdd={onAdd}
      />
    </MantineProvider>,
  );
  return { onChange, onAdd };
}

describe("SignatureImagePicker", () => {
  test("offers every saved signature beside the add tile", () => {
    renderPicker();

    expect(
      screen.getByRole("button", { name: "Drawn signature" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Initials" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "certSign.appearance.graphic.add",
      }),
    ).toBeTruthy();
  });

  test("asks for a new signature from the add tile", () => {
    const { onAdd } = renderPicker();

    fireEvent.click(
      screen.getByRole("button", { name: "certSign.appearance.graphic.add" }),
    );

    expect(onAdd).toHaveBeenCalled();
  });

  test("shows a new unsaved signature as the chosen tile", () => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:seal");
    globalThis.URL.revokeObjectURL = vi.fn();
    renderPicker(new File(["x"], "seal.png", { type: "image/png" }));

    expect(
      screen.getByRole("button", { name: "seal" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Drawn signature" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
