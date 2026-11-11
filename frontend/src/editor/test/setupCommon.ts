import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import "@editor/utils/engineShims";

if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: vi.fn(() => null),
    writable: true,
    configurable: true,
  });
}

class LocalStorageMock implements Storage {
  private store: Record<string, string> = {};
  get length(): number {
    return Object.keys(this.store).length;
  }
  clear(): void {
    this.store = {};
  }
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new LocalStorageMock(),
  writable: true,
});
global.URL.createObjectURL = vi.fn(() => "mocked-url");
global.URL.revokeObjectURL = vi.fn();
if (typeof File !== "undefined" && !File.prototype.arrayBuffer)
  File.prototype.arrayBuffer = () => Promise.resolve(new ArrayBuffer(8));
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer)
  Blob.prototype.arrayBuffer = () => Promise.resolve(new ArrayBuffer(8));

Object.defineProperty(globalThis, "crypto", {
  value: {
    subtle: { digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)) },
    getRandomValues: vi.fn((array: Uint8Array) => array),
  },
  writable: true,
  configurable: true,
});
global.Worker = vi.fn().mockImplementation(function () {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onmessage: null,
    onerror: null,
  };
});
global.ResizeObserver = vi.fn().mockImplementation(function () {
  return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
});
global.IntersectionObserver = vi.fn().mockImplementation(function () {
  return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
});
Object.defineProperty(globalThis, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrixStub {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    multiplySelf(): this {
      return this;
    }
    translateSelf(): this {
      return this;
    }
    scaleSelf(): this {
      return this;
    }
    rotateSelf(): this {
      return this;
    }
    inverse(): this {
      return this;
    }
  }
  Object.defineProperty(globalThis, "DOMMatrix", {
    value: DOMMatrixStub,
    writable: false,
    configurable: true,
  });
}

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });
