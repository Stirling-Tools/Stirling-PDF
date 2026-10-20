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
vi.mock("@app/services/heuristic/heuristicClassification", () => ({
  classifyFileHeuristically: vi.fn(async () => ({
    labels: ["invoice"],
    confidence: "medium",
    score: 30,
    language: "en",
    packs: ["en"],
  })),
}));

import apiClient from "@app/services/apiClient";
import {
  CLASSIFY_RUST_ENDPOINT,
  classifyRustOperationConfig,
  decodeVerdict,
} from "@app/hooks/tools/classifyRust/useClassifyRustOperation";
import { defaultParameters } from "@app/hooks/tools/classifyRust/useClassifyRustParameters";
import {
  onResults,
  type ClassifyRustResult,
} from "@app/services/classifyRustResults";
import { onTiming, type ToolTiming } from "@app/services/toolTiming";

const ON_SERVER = { ...defaultParameters, processOnServer: true };
const VERDICT = {
  labels: ["facture"],
  confidence: "high",
  probability: 0.97,
  score: 61,
  candidates: [{ label: "facture", score: 61, evidence: ['phrase "請求書"'] }],
};

/** Base64 of the verdict's UTF-8, as the server encodes it. */
function encoded(verdict: unknown): string {
  const utf8 = new TextEncoder().encode(JSON.stringify(verdict));
  return btoa(String.fromCharCode(...utf8));
}

function pdf(name: string): File {
  return new File(["%PDF-1.7"], name, { type: "application/pdf" });
}

function respondWith(headers: Record<string, string>) {
  (apiClient.post as Mock).mockResolvedValueOnce({
    data: new Blob(["%PDF-1.7 labelled"]),
    headers,
  });
}

describe("decodeVerdict", () => {
  it("decodes UTF-8 evidence from Base64", () => {
    expect(decodeVerdict(encoded(VERDICT))).toEqual(VERDICT);
  });

  it("returns null without a usable header", () => {
    expect(decodeVerdict(undefined)).toBeNull();
    expect(decodeVerdict("not base64 json")).toBeNull();
  });
});

describe("classifyRust on the server", () => {
  let timings: ToolTiming[];
  let results: ClassifyRustResult[][];
  let stopListening: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    timings = [];
    results = [];
    const stopTiming = onTiming("classify", "rust", (t) => timings.push(t));
    const stopResults = onResults((r) => results.push(r));
    stopListening = () => {
      stopTiming();
      stopResults();
    };
  });

  afterEach(() => stopListening());

  it("posts the file and keeps its name", async () => {
    respondWith({ "x-stirling-classification": encoded(VERDICT) });

    const result = await classifyRustOperationConfig.customProcessor(
      ON_SERVER,
      [pdf("scan.pdf")],
    );

    const [endpoint, form] = (apiClient.post as Mock).mock.calls[0];
    expect(endpoint).toBe(CLASSIFY_RUST_ENDPOINT);
    expect((form as FormData).get("fileInput")).toBeInstanceOf(File);
    expect((form as FormData).has("processOnServer")).toBe(false);
    expect(result.files.map((file) => file.name)).toEqual(["scan.pdf"]);
  });

  it("reports the server's verdict beside the heuristic's, and the timing", async () => {
    respondWith({
      "x-stirling-classification": encoded(VERDICT),
      "server-timing": "process;dur=7.5",
    });

    await classifyRustOperationConfig.customProcessor(ON_SERVER, [
      pdf("scan.pdf"),
    ]);

    expect(results).toEqual([
      [
        expect.objectContaining({
          fileName: "scan.pdf",
          rust: VERDICT,
          typescript: expect.objectContaining({ labels: ["invoice"] }),
        }),
      ],
    ]);
    expect(timings).toEqual([
      expect.objectContaining({ location: "server", serverProcessingMs: 7.5 }),
    ]);
  });

  it("still returns the file when the verdict header is not readable", async () => {
    respondWith({});

    const result = await classifyRustOperationConfig.customProcessor(
      ON_SERVER,
      [pdf("scan.pdf")],
    );

    expect(result.files).toHaveLength(1);
    expect(results[0][0].rust).toBeNull();
    expect(timings[0].serverProcessingMs).toBeNull();
  });

  it("reports nothing when the request fails", async () => {
    (apiClient.post as Mock).mockRejectedValueOnce(new Error("503"));

    await expect(
      classifyRustOperationConfig.customProcessor(ON_SERVER, [pdf("a.pdf")]),
    ).rejects.toThrow("503");
    expect(timings).toHaveLength(0);
    expect(results).toHaveLength(0);
  });
});
