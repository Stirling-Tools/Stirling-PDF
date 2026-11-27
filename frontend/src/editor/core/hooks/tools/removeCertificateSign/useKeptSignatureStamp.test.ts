import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  isVisibleSignatureStamp,
  useKeptSignatureStamp,
  type SignatureAnnotation,
} from "@editor/hooks/tools/removeCertificateSign/useKeptSignatureStamp";

const { pages, createDocument, destroyDocument } = vi.hoisted(() => {
  const pages: { value: SignatureAnnotation[][] } = { value: [] };
  return {
    pages,
    createDocument: vi.fn(async () => ({
      numPages: pages.value.length,
      getPage: async (pageNumber: number) => ({
        getAnnotations: async () => pages.value[pageNumber - 1],
      }),
    })),
    destroyDocument: vi.fn(),
  };
});

vi.mock("@editor/services/pdfWorkerManager", () => ({
  pdfWorkerManager: { createDocument, destroyDocument },
}));

const stamp: SignatureAnnotation = {
  subtype: "Widget",
  fieldType: "Sig",
  hasAppearance: true,
  annotationFlags: 4,
  rect: [36, 36, 236, 96],
};

const file = new File(["pdf"], "signed.pdf", { type: "application/pdf" });

describe("isVisibleSignatureStamp", () => {
  it("accepts a printed signature widget with an appearance", () => {
    expect(isVisibleSignatureStamp(stamp)).toBe(true);
  });

  it.each<[string, SignatureAnnotation]>([
    ["no appearance", { ...stamp, hasAppearance: false }],
    ["zero-size rect", { ...stamp, rect: [0, 0, 0, 0] }],
    ["hidden flag", { ...stamp, annotationFlags: 2 }],
    ["invisible flag", { ...stamp, annotationFlags: 1 }],
    ["no-view flag", { ...stamp, annotationFlags: 32 }],
    ["non-signature field", { ...stamp, fieldType: "Tx" }],
    ["non-widget annotation", { ...stamp, subtype: "Stamp" }],
  ])("rejects a signature with %s", (_label, annotation) => {
    expect(isVisibleSignatureStamp(annotation)).toBe(false);
  });
});

describe("useKeptSignatureStamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pages.value = [[], [stamp]];
  });

  it("reports a kept stamp when the option is off and an input has one", async () => {
    const { result } = renderHook(() => useKeptSignatureStamp());
    act(() => result.current.recordRun([file], false));
    await waitFor(() => expect(result.current.stampKept).toBe(true));
    expect(destroyDocument).toHaveBeenCalledTimes(1);
  });

  it("reports nothing when no input has a visible stamp", async () => {
    pages.value = [[{ ...stamp, rect: [0, 0, 0, 0] }]];
    const { result } = renderHook(() => useKeptSignatureStamp());
    act(() => result.current.recordRun([file], false));
    await waitFor(() => expect(destroyDocument).toHaveBeenCalledTimes(1));
    expect(result.current.stampKept).toBe(false);
  });

  it("skips inspection when the stamp is being removed", () => {
    const { result } = renderHook(() => useKeptSignatureStamp());
    act(() => result.current.recordRun([file], true));
    expect(createDocument).not.toHaveBeenCalled();
    expect(result.current.stampKept).toBe(false);
  });

  it("clears the previous result when a new run starts", async () => {
    const { result } = renderHook(() => useKeptSignatureStamp());
    act(() => result.current.recordRun([file], false));
    await waitFor(() => expect(result.current.stampKept).toBe(true));
    act(() => result.current.recordRun([file], true));
    expect(result.current.stampKept).toBe(false);
  });
});
