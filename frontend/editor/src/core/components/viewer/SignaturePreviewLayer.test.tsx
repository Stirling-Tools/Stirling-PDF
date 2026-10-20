import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, it, vi } from "vitest";
import { SignaturePreviewLayer } from "@app/components/viewer/SignaturePreviewLayer";
import type { SignaturePreview } from "@app/components/viewer/viewerTypes";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("@embedpdf/plugin-interaction-manager/react", () => ({
  useInteractionManagerCapability: () => ({
    provides: { pause: vi.fn(), resume: vi.fn() },
  }),
}));

const signature: SignaturePreview = {
  id: "draft",
  pageIndex: 0,
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.1,
  signatureData: "data:image/png;base64,AA==",
  signatureType: "canvas",
};

it.each([
  [true, undefined, false, "default", "none"],
  [false, signature.signatureData, false, "default", "none"],
  [true, signature.signatureData, true, "default", "none"],
  [true, signature.signatureData, false, "crosshair", "auto"],
] as const)(
  "captures placement only with a selected signature and Place mode (%s, %s, %s)",
  (placementMode, placementData, readOnly, cursor, pointerEvents) => {
    const onChange = vi.fn();
    const { container } = render(
      <MantineProvider>
        <SignaturePreviewLayer
          pageIndex={0}
          pageWidth={600}
          pageHeight={800}
          previews={[]}
          onChange={onChange}
          placementMode={placementMode}
          placementData={placementData}
          readOnly={readOnly}
        />
      </MantineProvider>,
    );
    const layer = container.querySelector("div")!;
    expect(layer).toHaveStyle({ cursor, "pointer-events": pointerEvents });
    fireEvent.click(layer, { clientX: 200, clientY: 300 });
    expect(onChange).toHaveBeenCalledTimes(cursor === "crosshair" ? 1 : 0);
  },
);

it.each(["move", "resize"])(
  "commits %s once on release after transient pointer updates",
  (gesture) => {
    const onChange = vi.fn();
    const { container } = render(
      <MantineProvider>
        <SignaturePreviewLayer
          pageIndex={0}
          pageWidth={600}
          pageHeight={800}
          previews={[signature]}
          onChange={onChange}
          placementMode={false}
          readOnly={false}
        />
      </MantineProvider>,
    );
    const target =
      gesture === "move"
        ? screen.getByRole("img", { name: "Signature preview" }).parentElement!
        : container.querySelector<HTMLElement>('[data-resize-handle="true"]')!;
    target.setPointerCapture = vi.fn();
    target.releasePointerCapture = vi.fn();
    fireEvent(
      target,
      new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 200,
        clientY: 300,
      }),
    );
    fireEvent(
      target,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 210,
        clientY: 310,
      }),
    );
    fireEvent(
      target,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 220,
        clientY: 320,
      }),
    );
    expect(onChange.mock.calls.map((call) => call[1])).toEqual([true, true]);
    const updated = onChange.mock.calls.at(-1)![0];
    fireEvent(
      target,
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 220,
        clientY: 320,
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith(updated);
    expect(updated[0]).not.toEqual(signature);
  },
);
