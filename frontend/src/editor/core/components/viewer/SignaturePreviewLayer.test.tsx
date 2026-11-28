import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, it, vi } from "vitest";
import { SignaturePreviewLayer } from "@editor/components/viewer/SignaturePreviewLayer";
import type { SignaturePreview } from "@editor/components/viewer/viewerTypes";

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

// Unrotated page is 600x800; on screen the layer's box is 800x600 at 90/270.
const screenBox = (rotation: number) => {
  const quarter = rotation % 2 === 1;
  const width = quarter ? 800 : 600;
  const height = quarter ? 600 : 800;
  return { left: 0, top: 0, right: width, bottom: height, width, height };
};

function renderRotated(
  rotation: number,
  props: Partial<ComponentProps<typeof SignaturePreviewLayer>>,
) {
  const onChange = vi.fn();
  const { container } = render(
    <MantineProvider>
      <SignaturePreviewLayer
        pageIndex={0}
        pageWidth={600}
        pageHeight={800}
        rotation={rotation}
        previews={[]}
        onChange={onChange}
        placementMode={false}
        readOnly={false}
        {...props}
      />
    </MantineProvider>,
  );
  const layer = container.querySelector("div")!;
  layer.getBoundingClientRect = () => screenBox(rotation) as DOMRect;
  return { layer, onChange };
}

// Screen point of unrotated (150, 200) under each clockwise quarter turn.
it.each([
  [0, 150, 200],
  [1, 600, 150],
  [2, 450, 600],
  [3, 200, 450],
])(
  "places a click at the unrotated point on rotation %i",
  (rotation, clientX, clientY) => {
    const { layer, onChange } = renderRotated(rotation, {
      placementMode: true,
      placementData: signature.signatureData,
    });
    fireEvent.click(layer, { clientX, clientY });
    const [placed] = onChange.mock.calls[0][0] as SignaturePreview[];
    expect(placed.x * 600 + 75).toBeCloseTo(150);
    expect(placed.y * 800 + 37.5).toBeCloseTo(200);
  },
);

// A screen drag of (+30, 0) is unrotated (+30,0), (0,-30), (-30,0), (0,+30).
it.each([
  [0, 30, 0],
  [1, 0, -30],
  [2, -30, 0],
  [3, 0, 30],
])(
  "moves a preview along the unrotated axes on rotation %i",
  (rotation, dx, dy) => {
    const { onChange } = renderRotated(rotation, { previews: [signature] });
    const target = screen.getByRole("img", {
      name: "Signature preview",
    }).parentElement!;
    target.setPointerCapture = vi.fn();
    target.releasePointerCapture = vi.fn();
    const down = { bubbles: true, clientX: 300, clientY: 300 };
    fireEvent(target, new MouseEvent("pointerdown", down));
    fireEvent(target, new MouseEvent("pointermove", { ...down, clientX: 330 }));
    const [moved] = onChange.mock.calls.at(-1)![0] as SignaturePreview[];
    expect((moved.x - signature.x) * 600).toBeCloseTo(dx);
    expect((moved.y - signature.y) * 800).toBeCloseTo(dy);
  },
);
