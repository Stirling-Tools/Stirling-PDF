import { fireEvent, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, expect, it, vi } from "vitest";
import { DrawSignatureCanvas } from "@app/components/shared/wetSignature/DrawSignatureCanvas";

afterEach(() => vi.restoreAllMocks());

it("maps the full displayed drawing area to the saved canvas at narrow widths", () => {
  const ctx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,AA==",
  );
  const onChange = vi.fn();
  const { container } = render(
    <MantineProvider>
      <DrawSignatureCanvas signature={null} onChange={onChange} />
    </MantineProvider>,
  );
  const canvas = container.querySelector("canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 210,
    bottom: 95,
    width: 200,
    height: 75,
    toJSON: () => ({}),
  });
  fireEvent.mouseDown(canvas, { clientX: 20, clientY: 30 });
  fireEvent.mouseMove(canvas, { clientX: 200, clientY: 85 });
  fireEvent.mouseUp(canvas);
  expect(ctx.moveTo).toHaveBeenCalledWith(20, 20);
  expect(ctx.lineTo).toHaveBeenCalledWith(380, 130);
  expect(onChange).toHaveBeenCalledWith("data:image/png;base64,AA==");
});
