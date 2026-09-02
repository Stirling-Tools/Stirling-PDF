import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeyCombo } from "@app/ui/KeyCombo";

/** Every <kbd> the combo rendered, in order. */
function keycaps(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("kbd")).map(
    (el) => el.textContent ?? "",
  );
}

describe("KeyCombo", () => {
  it("gives each key of a combo its own cap", () => {
    const { container } = render(<KeyCombo combo="Ctrl + Shift + V" />);
    expect(keycaps(container)).toEqual(["Ctrl", "Shift", "V"]);
  });

  it("splits an unspaced combo the same way", () => {
    // Both spellings have to land identically, or a list written by two people
    // renders as a mix of tiles and run-on strings.
    const { container } = render(<KeyCombo combo="Ctrl+Shift+V" />);
    expect(keycaps(container)).toEqual(["Ctrl", "Shift", "V"]);
  });

  it("keeps alternatives apart with a separator, not a cap", () => {
    const { container } = render(<KeyCombo combo="F3 / Ctrl + G" />);
    expect(keycaps(container)).toEqual(["F3", "Ctrl", "G"]);
    expect(container.textContent).toContain("/");
  });

  it("treats a word key as one cap", () => {
    const { container } = render(<KeyCombo combo="Ctrl + Click + Drag" />);
    expect(keycaps(container)).toEqual(["Ctrl", "Click", "Drag"]);
  });

  it("renders a lone key with no separators", () => {
    const { container } = render(<KeyCombo combo="Esc" />);
    expect(keycaps(container)).toEqual(["Esc"]);
  });

  it("survives a bare '+' being the key itself", () => {
    const { container } = render(<KeyCombo combo="+" />);
    expect(keycaps(container)).toEqual(["+"]);
  });

  it("survives a bare '/' being the key itself", () => {
    const { container } = render(<KeyCombo combo="/" />);
    expect(keycaps(container)).toEqual(["/"]);
  });

  it("adds a plus between keys only when asked", () => {
    const { container } = render(<KeyCombo combo="Ctrl + S" withPlus />);
    expect(keycaps(container)).toEqual(["Ctrl", "S"]);
    expect(container.textContent).toContain("+");
  });

  it("marks a long key so it can be styled as a word", () => {
    const { container } = render(<KeyCombo combo="PageDown" />);
    expect(container.querySelector("kbd")?.className).toContain(
      "sui-keycap--word",
    );
  });

  it("does not mark a short key as a word", () => {
    const { container } = render(<KeyCombo combo="Ctrl" />);
    expect(container.querySelector("kbd")?.className).not.toContain(
      "sui-keycap--word",
    );
  });
});
