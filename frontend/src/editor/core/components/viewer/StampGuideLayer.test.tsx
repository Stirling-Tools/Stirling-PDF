import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { StampGuide } from "@editor/contexts/SignatureFieldPickerContext";

const picker = vi.hoisted(() => ({ guide: null as StampGuide | null }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback }),
}));
vi.mock("@embedpdf/plugin-interaction-manager/react", () => ({
  useInteractionManagerCapability: () => ({ provides: null }),
}));
vi.mock("@editor/contexts/SignatureFieldPickerContext", () => ({
  useSignatureFieldPicker: () => ({ guide: picker.guide }),
}));
vi.mock("@editor/types/fileContext", () => ({
  isStirlingFile: () => true,
}));

import { StampGuideLayer } from "@editor/components/viewer/StampGuideLayer";

const PAGE = { width: 600, height: 800 };

function renderGuide(turns: number, overrides: Partial<StampGuide> = {}) {
  const onChange = vi.fn();
  picker.guide = {
    fileId: "file",
    placing: true,
    pageIndex: null,
    rect: null,
    pageSizes: [PAGE],
    pageRotations: [turns],
    defaultSize: { width: 200, height: 50 },
    preview: "data:image/png;base64,AA==",
    onChange,
    ...overrides,
  };
  const source = Object.assign(new Blob(), { fileId: "file" });
  const { container } = render(
    <StampGuideLayer
      pageIndex={0}
      pdfSource={source}
      pageWidth={PAGE.width}
      pageHeight={PAGE.height}
    />,
  );
  return { container, onChange };
}

it.each([
  [0, { width: 200, height: 50 }],
  [1, { width: 50, height: 200 }],
  [2, { width: 200, height: 50 }],
  [3, { width: 50, height: 200 }],
])(
  "places the default box landscape as shown on /Rotate %i",
  (turns, pageSize) => {
    const { container, onChange } = renderGuide(turns);
    const surface = container.querySelector(".stamp-guide-surface")!;
    fireEvent.click(surface);
    expect(onChange).toHaveBeenCalledWith(0, expect.objectContaining(pageSize));
  },
);

it.each([0, 1, 2, 3])(
  "draws the placed stamp upright on /Rotate %i",
  (turns) => {
    const quarter = turns % 2 === 1;
    const rect = quarter
      ? { x: 100, y: 100, width: 54, height: 204 }
      : { x: 100, y: 100, width: 204, height: 54 };
    const { container } = renderGuide(turns, {
      placing: false,
      pageIndex: 0,
      rect,
    });
    const img = container.querySelector<HTMLImageElement>(
      ".stamp-guide-box img",
    )!;
    // Box content is the rect less its 2px border; the image takes the shown size inside it.
    expect(img.style.width).toBe("200px");
    expect(img.style.height).toBe("50px");
    expect(img.style.transform).toBe(turns ? `rotate(${-90 * turns}deg)` : "");
  },
);
