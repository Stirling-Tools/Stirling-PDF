import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useActiveUrlSource } from "@editor/components/viewer/useActiveUrlSource";

const pdf = (name: string) =>
  new File([name], name, { type: "application/pdf" });

describe("the source of the document the viewer shows", () => {
  it("uses the first document's bytes as soon as they are fetched", () => {
    const { result } = renderHook(() => useActiveUrlSource());
    const first = pdf("first.pdf");
    act(() => result.current.stage("a", first, true));
    expect(result.current.source).toBe(first);
  });

  it("keeps the outgoing bytes until a replacement lands", () => {
    const { result } = renderHook(() => useActiveUrlSource());
    const first = pdf("first.pdf");
    const second = pdf("second.pdf");
    act(() => result.current.stage("a", first, true));
    act(() => result.current.stage("b", second, false));
    expect(result.current.source).toBe(first);
    act(() => result.current.settle("b", true));
    expect(result.current.source).toBe(second);
  });

  it("keeps the outgoing bytes when the replacement fails to open", () => {
    const { result } = renderHook(() => useActiveUrlSource());
    const first = pdf("first.pdf");
    act(() => result.current.stage("a", first, true));
    act(() => result.current.stage("b", pdf("second.pdf"), false));
    act(() => result.current.settle("b", false));
    expect(result.current.source).toBe(first);
    act(() => result.current.settle("b", true));
    expect(result.current.source).toBe(first);
  });

  it("ignores the outcome of a replacement that was superseded", () => {
    const { result } = renderHook(() => useActiveUrlSource());
    const first = pdf("first.pdf");
    const third = pdf("third.pdf");
    act(() => result.current.stage("a", first, true));
    act(() => result.current.stage("b", pdf("second.pdf"), false));
    act(() => result.current.stage("c", third, false));
    act(() => result.current.settle("b", true));
    expect(result.current.source).toBe(first);
    act(() => result.current.settle("c", true));
    expect(result.current.source).toBe(third);
  });
});
