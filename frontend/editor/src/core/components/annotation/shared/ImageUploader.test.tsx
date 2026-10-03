import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageUploader } from "@app/components/annotation/shared/ImageUploader";
import { expectConsole } from "@app/tests/failOnConsole";
import { removeWhiteBackground } from "@app/utils/imageTransparency";

vi.mock("@app/components/shared/PrivateContent", () => ({
  PrivateContent: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@app/utils/imageTransparency", () => ({
  removeWhiteBackground: vi.fn(),
}));

interface CanvasRecord {
  canvas: HTMLCanvasElement;
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
}

const imageDimensions = new Map<string, { width: number; height: number }>();
const imageSources: string[] = [];
const canvasRecords: CanvasRecord[] = [];
const fileReaderDataUrls: string[] = [];
const originalCreateElement = document.createElement.bind(document);
const OriginalFileReader = globalThis.FileReader;
const OriginalImage = globalThis.Image;

class MockFileReader {
  error: DOMException | null = null;
  onerror: (() => void) | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  result: string | ArrayBuffer | null = null;

  readAsDataURL(file: Blob): void {
    const name = (file as File).name;
    this.result = `data:${file.type};base64,${name}`;
    fileReaderDataUrls.push(this.result);
    this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
  }

  readAsText(_file: Blob): void {
    this.result = '<svg width="240" height="120"></svg>';
    this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
  }
}

class MockImage {
  height = 0;
  naturalHeight = 0;
  naturalWidth = 0;
  onerror: ((event: Event) => void) | null = null;
  onload: (() => void) | null = null;
  width = 0;

  set src(value: string) {
    imageSources.push(value);
    const dimensions = imageDimensions.get(value);

    if (!dimensions) {
      queueMicrotask(() => this.onerror?.(new Event("error")));
      return;
    }

    this.width = dimensions.width;
    this.height = dimensions.height;
    this.naturalWidth = dimensions.width;
    this.naturalHeight = dimensions.height;
    queueMicrotask(() => this.onload?.());
  }
}

const installCanvasMock = () => {
  vi.spyOn(document, "createElement").mockImplementation(((
    tagName: string,
    options?: ElementCreationOptions,
  ) => {
    if (tagName !== "canvas") {
      return originalCreateElement(tagName, options);
    }

    const canvas = originalCreateElement("canvas");
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const context = {
      drawImage,
      fillRect,
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(canvas, "getContext").mockReturnValue(context);
    vi.spyOn(canvas, "toDataURL").mockImplementation(
      () => `data:image/png;base64,${canvas.width}x${canvas.height}`,
    );
    canvasRecords.push({ canvas, drawImage, fillRect });
    return canvas;
  }) as typeof document.createElement);
};

const renderUploader = (
  overrides: Pick<
    React.ComponentProps<typeof ImageUploader>,
    "allowBackgroundRemoval"
  > = {},
) => {
  const onImageChange = vi.fn();
  const onProcessedImageData = vi.fn();

  render(
    <MantineProvider>
      <ImageUploader
        label="Signature image"
        onImageChange={onImageChange}
        onProcessedImageData={onProcessedImageData}
        {...overrides}
      />
    </MantineProvider>,
  );

  return {
    input: screen.getByLabelText("Signature image") as HTMLInputElement,
    onImageChange,
    onProcessedImageData,
  };
};

describe("ImageUploader", () => {
  beforeEach(() => {
    imageDimensions.clear();
    imageSources.length = 0;
    canvasRecords.length = 0;
    fileReaderDataUrls.length = 0;
    vi.clearAllMocks();
    installCanvasMock();
    Object.defineProperty(globalThis, "FileReader", {
      configurable: true,
      value: MockFileReader,
    });
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: MockImage,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "FileReader", {
      configurable: true,
      value: OriginalFileReader,
    });
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: OriginalImage,
    });
  });

  it("bakes the browser-decoded JPEG orientation into a PNG", async () => {
    const source = "data:image/jpeg;base64,oriented.jpg";
    imageDimensions.set(source, { width: 120, height: 240 });
    const file = new File(["jpeg"], "oriented.jpg", { type: "image/jpeg" });
    const { input, onImageChange, onProcessedImageData } = renderUploader();

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onProcessedImageData).toHaveBeenCalledWith(
        "data:image/png;base64,120x240",
      ),
    );
    expect(onImageChange).toHaveBeenCalledWith(file);
    expect(canvasRecords[0].canvas.width).toBe(120);
    expect(canvasRecords[0].canvas.height).toBe(240);
    expect(canvasRecords[0].drawImage).toHaveBeenCalledWith(
      expect.any(MockImage),
      0,
      0,
      120,
      240,
    );
  });

  it("preserves raster dimensions and transparency while returning the original file", async () => {
    const source = "data:image/png;base64,transparent.png";
    imageDimensions.set(source, { width: 320, height: 180 });
    const file = new File(["png"], "transparent.png", { type: "image/png" });
    const { input, onImageChange, onProcessedImageData } = renderUploader();

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onProcessedImageData).toHaveBeenCalledWith(
        "data:image/png;base64,320x180",
      ),
    );
    expect(onImageChange).toHaveBeenCalledWith(file);
    expect(canvasRecords[0].fillRect).not.toHaveBeenCalled();
  });

  it("uses the normalized PNG when background removal is enabled", async () => {
    const source = "data:image/jpeg;base64,oriented.jpg";
    imageDimensions.set(source, { width: 120, height: 240 });
    vi.mocked(removeWhiteBackground).mockResolvedValue(
      "data:image/png;base64,transparent",
    );
    const file = new File(["jpeg"], "oriented.jpg", { type: "image/jpeg" });
    const { input, onProcessedImageData } = renderUploader({
      allowBackgroundRemoval: true,
    });

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(onProcessedImageData).toHaveBeenCalledWith(
        "data:image/png;base64,120x240",
      ),
    );

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() =>
      expect(removeWhiteBackground).toHaveBeenCalledWith(
        "data:image/png;base64,120x240",
        { autoDetectCorner: true, tolerance: 15 },
      ),
    );
    expect(removeWhiteBackground).not.toHaveBeenCalledWith(
      source,
      expect.anything(),
    );
  });

  it("converts an SVG once using its declared dimensions", async () => {
    imageDimensions.set("mocked-url", { width: 240, height: 120 });
    const file = new File(["svg"], "signature.svg", {
      type: "image/svg+xml",
    });
    const { input, onProcessedImageData } = renderUploader();

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onProcessedImageData).toHaveBeenCalledWith(
        "data:image/png;base64,240x120",
      ),
    );
    expect(imageSources).toEqual(["mocked-url"]);
    expect(fileReaderDataUrls).toEqual([]);
    expect(canvasRecords).toHaveLength(1);
  });

  it("recovers from a decode failure without emitting invalid image data", async () => {
    const brokenSource = "data:image/jpeg;base64,broken.jpg";
    const validSource = "data:image/png;base64,valid.png";
    imageDimensions.set(validSource, { width: 64, height: 32 });
    const brokenFile = new File(["broken"], "broken.jpg", {
      type: "image/jpeg",
    });
    const validFile = new File(["valid"], "valid.png", { type: "image/png" });
    expectConsole.error("Error processing image file:");
    const { input, onProcessedImageData } = renderUploader();

    fireEvent.change(input, { target: { files: [brokenFile] } });
    await waitFor(() => expect(imageSources).toContain(brokenSource));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onProcessedImageData).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [validFile] } });

    await waitFor(() =>
      expect(onProcessedImageData).toHaveBeenCalledWith(
        "data:image/png;base64,64x32",
      ),
    );
  });
});
