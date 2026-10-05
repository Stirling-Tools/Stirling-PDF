import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  revealPickerTool,
  waitForElement,
  waitForHighlightable,
} from "@app/components/onboarding/tourUtils";

describe("tourUtils", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("waitForElement", () => {
    it("resolves immediately when the element already exists", async () => {
      const el = document.createElement("div");
      el.id = "target";
      document.body.appendChild(el);

      await expect(waitForElement("#target", 500)).resolves.toBeUndefined();
    });

    it("resolves when the element is added later", async () => {
      const promise = waitForElement("#target", 1000);

      setTimeout(() => {
        const el = document.createElement("div");
        el.id = "target";
        document.body.appendChild(el);
      }, 50);

      await expect(promise).resolves.toBeUndefined();
    });

    it("resolves after timeout without throwing", async () => {
      await expect(waitForElement("#missing", 50)).resolves.toBeUndefined();
    });
  });

  describe("waitForHighlightable", () => {
    it("resolves immediately when element has layout dimensions", async () => {
      const el = document.createElement("div");
      el.id = "target";
      vi.spyOn(el, "getClientRects").mockReturnValue([
        { width: 100, height: 40 } as DOMRect,
      ]);
      document.body.appendChild(el);

      const resizeSpy = vi.fn();
      window.addEventListener("resize", resizeSpy);

      await waitForHighlightable("#target", 500);

      expect(resizeSpy).toHaveBeenCalled();
      window.removeEventListener("resize", resizeSpy);
    });

    it("resolves after timeout if element never receives dimensions", async () => {
      const el = document.createElement("div");
      el.id = "target";
      vi.spyOn(el, "getClientRects").mockReturnValue(
        [] as unknown as DOMRectList,
      );
      document.body.appendChild(el);

      await expect(
        waitForHighlightable("#target", 50),
      ).resolves.toBeUndefined();
    });
  });

  describe("revealPickerTool", () => {
    it("scrolls into view and resolves if element already exists and has layout", async () => {
      const el = document.createElement("div");
      el.setAttribute("data-tour", "tool-button-crop");
      const scrollIntoViewSpy = vi.fn();
      el.scrollIntoView = scrollIntoViewSpy;
      vi.spyOn(el, "getClientRects").mockReturnValue([
        { width: 80, height: 32 } as DOMRect,
      ]);
      document.body.appendChild(el);

      await revealPickerTool('[data-tour="tool-button-crop"]', 500);

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        block: "center",
        behavior: "smooth",
      });
    });

    it("scrolls the .tool-picker-scrollable container until the lazy element mounts", async () => {
      const scroller = document.createElement("div");
      scroller.className = "tool-picker-scrollable";
      Object.defineProperty(scroller, "clientHeight", {
        value: 300,
        configurable: true,
      });
      Object.defineProperty(scroller, "scrollHeight", {
        value: 1200,
        configurable: true,
      });
      scroller.scrollTop = 0;
      document.body.appendChild(scroller);

      let scrollCount = 0;
      scroller.addEventListener("scroll", () => {
        scrollCount += 1;
        if (scrollCount === 2) {
          const button = document.createElement("button");
          button.setAttribute("data-tour", "tool-button-crop");
          button.scrollIntoView = vi.fn();
          vi.spyOn(button, "getClientRects").mockReturnValue([
            { width: 80, height: 32 } as DOMRect,
          ]);
          scroller.appendChild(button);
        }
      });

      await revealPickerTool('[data-tour="tool-button-crop"]', 1000);

      const mountedButton = document.querySelector(
        '[data-tour="tool-button-crop"]',
      );
      expect(mountedButton).not.toBeNull();
      expect(mountedButton?.scrollIntoView).toHaveBeenCalledWith({
        block: "center",
        behavior: "smooth",
      });
      expect(scrollCount).toBeGreaterThanOrEqual(2);
    });

    it("handles absence of .tool-picker-scrollable gracefully without throwing", async () => {
      await expect(
        revealPickerTool('[data-tour="tool-button-crop"]', 50),
      ).resolves.toBeUndefined();
    });
  });
});
