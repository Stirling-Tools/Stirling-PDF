import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWheelZoom } from "@app/hooks/useWheelZoom";

describe("useWheelZoom", () => {
  it("triggers onZoomIn and prevents default when wheel deltaY reaches negative threshold with ctrlKey", () => {
    const element = document.createElement("div");
    const ref = { current: element };
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();

    renderHook(() =>
      useWheelZoom({
        ref,
        onZoomIn,
        onZoomOut,
        threshold: 10,
        requireModifierKey: true,
      }),
    );

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -12,
    });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    const stopPropagationSpy = vi.spyOn(event, "stopPropagation");

    element.dispatchEvent(event);

    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).not.toHaveBeenCalled();
    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(stopPropagationSpy).toHaveBeenCalledTimes(1);
  });

  it("triggers onZoomOut when wheel deltaY reaches positive threshold with metaKey", () => {
    const element = document.createElement("div");
    const ref = { current: element };
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();

    renderHook(() =>
      useWheelZoom({
        ref,
        onZoomIn,
        onZoomOut,
        threshold: 10,
        requireModifierKey: true,
      }),
    );

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
      deltaY: 15,
    });

    element.dispatchEvent(event);

    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onZoomIn).not.toHaveBeenCalled();
  });

  it("ignores wheel events without modifier keys when requireModifierKey is true", () => {
    const element = document.createElement("div");
    const ref = { current: element };
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();

    renderHook(() =>
      useWheelZoom({
        ref,
        onZoomIn,
        onZoomOut,
        threshold: 10,
        requireModifierKey: true,
      }),
    );

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: false,
      metaKey: false,
      deltaY: -20,
    });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    element.dispatchEvent(event);

    expect(onZoomIn).not.toHaveBeenCalled();
    expect(onZoomOut).not.toHaveBeenCalled();
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("does not attach listeners when enabled is false", () => {
    const element = document.createElement("div");
    const ref = { current: element };
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();

    renderHook(() =>
      useWheelZoom({
        ref,
        onZoomIn,
        onZoomOut,
        enabled: false,
      }),
    );

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -20,
    });
    element.dispatchEvent(event);

    expect(onZoomIn).not.toHaveBeenCalled();
  });
});
