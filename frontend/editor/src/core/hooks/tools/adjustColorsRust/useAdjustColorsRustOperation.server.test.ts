import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

vi.mock("@app/services/apiClient", () => ({
  default: { post: vi.fn() },
}));

import apiClient from "@app/services/apiClient";
import {
  ADJUST_COLORS_RUST_ENDPOINT,
  adjustColorsRustOperationConfig,
} from "@app/hooks/tools/adjustColorsRust/useAdjustColorsRustOperation";
import { defaultParameters } from "@app/hooks/tools/adjustColorsRust/useAdjustColorsRustParameters";
import { onTiming, type ToolTiming } from "@app/services/toolTiming";

const ON_SERVER = { ...defaultParameters, processOnServer: true };

function pdf(name: string): File {
  return new File(["%PDF-1.7"], name, { type: "application/pdf" });
}

function respondWith(...serverTimings: (string | undefined)[]) {
  for (const serverTiming of serverTimings) {
    (apiClient.post as Mock).mockResolvedValueOnce({
      data: new Blob(["%PDF-1.7 adjusted"]),
      headers: serverTiming ? { "server-timing": serverTiming } : {},
    });
  }
}

describe("adjustColorsRust on the server", () => {
  let timings: ToolTiming[];
  let stopListening: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    timings = [];
    stopListening = onTiming("adjustColors", "rust", (timing) =>
      timings.push(timing),
    );
  });

  afterEach(() => stopListening());

  it("posts each file with the adjustments and keeps its name", async () => {
    respondWith("process;dur=10");

    const result = await adjustColorsRustOperationConfig.customProcessor(
      { ...ON_SERVER, contrast: 150 },
      [pdf("scan.pdf")],
    );

    const [endpoint, form] = (apiClient.post as Mock).mock.calls[0];
    expect(endpoint).toBe(ADJUST_COLORS_RUST_ENDPOINT);
    expect((form as FormData).get("contrast")).toBe("150");
    expect((form as FormData).has("processOnServer")).toBe(false);
    expect(result.files.map((file) => file.name)).toEqual(["scan.pdf"]);
  });

  it("reports the round trip and the summed server processing time", async () => {
    respondWith("process;dur=10.5", "process;dur=4");

    await adjustColorsRustOperationConfig.customProcessor(ON_SERVER, [
      pdf("a.pdf"),
      pdf("b.pdf"),
    ]);

    expect(timings).toHaveLength(1);
    expect(timings[0]).toMatchObject({
      implementation: "rust",
      location: "server",
      files: 2,
      serverProcessingMs: 14.5,
    });
    expect(timings[0].totalMs).toBeGreaterThanOrEqual(0);
  });

  it("leaves server processing unknown when a response lacks the header", async () => {
    respondWith("process;dur=10", undefined);

    await adjustColorsRustOperationConfig.customProcessor(ON_SERVER, [
      pdf("a.pdf"),
      pdf("b.pdf"),
    ]);

    expect(timings[0].serverProcessingMs).toBeNull();
  });

  it("reports nothing when the request fails", async () => {
    (apiClient.post as Mock).mockRejectedValueOnce(new Error("503"));

    await expect(
      adjustColorsRustOperationConfig.customProcessor(ON_SERVER, [
        pdf("a.pdf"),
      ]),
    ).rejects.toThrow("503");
    expect(timings).toHaveLength(0);
  });
});
