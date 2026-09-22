import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { adjustFontSizeToFit } from "@app/components/shared/fitText/textFit";

describe("adjustFontSizeToFit", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    element = document.createElement("div");
    document.body.appendChild(element);
    element.style.fontSize = "16px";
  });

  afterEach(() => {
    vi.useRealTimers();
    element.remove();
  });

  it("does not change font size when content already fits", () => {
    Object.defineProperty(element, "scrollWidth", {
      value: 50,
      configurable: true,
    });
    Object.defineProperty(element, "clientWidth", {
      value: 100,
      configurable: true,
    });
    Object.defineProperty(element, "scrollHeight", {
      value: 20,
      configurable: true,
    });

    const cleanup = adjustFontSizeToFit(element, { maxFontSizePx: 16 });
    vi.runAllTimers();
    cleanup();

    expect(element.style.fontSize).toBe("16px");
  });

  it("reduces font size when content overflows width", () => {
    let currentSize = 16;
    Object.defineProperty(element, "clientWidth", {
      value: 100,
      configurable: true,
    });
    Object.defineProperty(element, "scrollWidth", {
      get: () => currentSize * 8, // at 16px: 128px (> 100); at 12px: 96px (<= 100)
      configurable: true,
    });
    Object.defineProperty(element, "scrollHeight", {
      value: 20,
      configurable: true,
    });

    let fontSizeVal = "16px";
    Object.defineProperty(element.style, "fontSize", {
      get: () => fontSizeVal,
      set: (val: string) => {
        fontSizeVal = val;
        currentSize = parseFloat(val);
      },
      configurable: true,
    });

    const cleanup = adjustFontSizeToFit(element, {
      maxFontSizePx: 16,
      minFontScale: 0.5,
    });
    vi.runAllTimers();
    cleanup();

    expect(currentSize).toBeLessThan(16);
    expect(currentSize).toBeGreaterThanOrEqual(8);
  });

  it("respects minFontScale and does not shrink below it", () => {
    Object.defineProperty(element, "clientWidth", {
      value: 50,
      configurable: true,
    });
    Object.defineProperty(element, "scrollWidth", {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(element, "scrollHeight", {
      value: 20,
      configurable: true,
    });

    let fontSizeVal = "20px";
    Object.defineProperty(element.style, "fontSize", {
      get: () => fontSizeVal,
      set: (val: string) => {
        fontSizeVal = val;
      },
      configurable: true,
    });

    const cleanup = adjustFontSizeToFit(element, {
      maxFontSizePx: 20,
      minFontScale: 0.7, // minimum 14px
    });
    vi.runAllTimers();
    cleanup();

    expect(parseFloat(fontSizeVal)).toBeCloseTo(14, 1);
  });
});
