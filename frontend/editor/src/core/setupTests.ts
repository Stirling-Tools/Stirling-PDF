import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { vi } from "vitest";
import { installFailOnConsole } from "@app/tests/failOnConsole";

installFailOnConsole();

afterEach(() => {
  cleanup();
});

// Mock localStorage for tests
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

Object.defineProperty(window, "localStorage", {
  value: new LocalStorageMock(),
  writable: true,
});

// Mock i18next for tests
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: vi.fn(),
    },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock i18next-http-backend
vi.mock("i18next-http-backend", () => ({
  default: {
    type: "backend",
    init: vi.fn(),
    read: vi.fn(),
    save: vi.fn(),
  },
}));

// Mock window.URL.createObjectURL and revokeObjectURL for tests
global.URL.createObjectURL = vi.fn(() => "mocked-url");
global.URL.revokeObjectURL = vi.fn();

// Mock File and Blob API methods that aren't available in jsdom
if (!globalThis.File.prototype.arrayBuffer) {
  globalThis.File.prototype.arrayBuffer = function () {
    // Return a simple ArrayBuffer with some mock data
    const buffer = new ArrayBuffer(8);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3, 4, 5, 6, 7, 8]);
    return Promise.resolve(buffer);
  };
}

if (!globalThis.Blob.prototype.arrayBuffer) {
  globalThis.Blob.prototype.arrayBuffer = function () {
    // Return a simple ArrayBuffer with some mock data
    const buffer = new ArrayBuffer(8);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3, 4, 5, 6, 7, 8]);
    return Promise.resolve(buffer);
  };
}

// Mock crypto.subtle for hashing in tests - force override even if exists
const mockHashBuffer = new ArrayBuffer(32);
const mockHashView = new Uint8Array(mockHashBuffer);
// Fill with predictable mock hash data
for (let i = 0; i < 32; i++) {
  mockHashView[i] = i;
}

// Force override crypto.subtle to avoid Node.js native implementation
Object.defineProperty(globalThis, "crypto", {
  value: {
    subtle: {
      digest: vi
        .fn()
        .mockImplementation(async (_algorithm: string, _data: BufferSource) => {
          // Always return the mock hash buffer regardless of input
          return mockHashBuffer.slice();
        }),
    },
    getRandomValues: vi.fn().mockImplementation((array: Uint8Array) => {
      // Mock getRandomValues if needed
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }),
  } as unknown as Crypto,
  writable: true,
  configurable: true,
});

// Mock Worker for tests (Web Workers not available in test environment)
class MockWorker implements Worker {
  onmessage: ((this: Worker, ev: MessageEvent) => any) | null = null;
  onmessageerror: ((this: Worker, ev: MessageEvent) => any) | null = null;
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => any) | null = null;

  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn(() => true);
}

global.Worker = MockWorker as unknown as typeof Worker;

// Mock ResizeObserver for Mantine components
class MockResizeObserver implements ResizeObserver {
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock IntersectionObserver for components that might use it
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  readonly takeRecords = vi.fn(() => []);
}

global.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock matchMedia for responsive components
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Provide a minimal DOMMatrix implementation for pdf.js in the test environment
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrixStub {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
      }
    }

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

// Set global test timeout to prevent hangs
vi.setConfig({ testTimeout: 5000, hookTimeout: 5000 });
