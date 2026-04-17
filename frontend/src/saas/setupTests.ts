import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();
Object.defineProperty(global, "localStorage", { value: localStorageMock });

// Mock Supabase for tests
vi.mock("@app/auth/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      refreshSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
  debugAuthEvents: vi.fn(),
}));

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
    getRandomValues: vi
      .fn()
      .mockImplementation(<T extends ArrayBufferView>(array: T): T => {
        // Mock getRandomValues if needed
        const view = new Uint8Array(
          array.buffer,
          array.byteOffset,
          array.byteLength,
        );
        for (let i = 0; i < view.length; i++) {
          view[i] = Math.floor(Math.random() * 256);
        }
        return array;
      }),
  } as unknown as Crypto,
  writable: true,
  configurable: true,
});

// Mock Worker for tests (Web Workers not available in test environment)
global.Worker = vi.fn().mockImplementation(() => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  onmessage: null,
  onerror: null,
}));

// Mock ResizeObserver for Mantine components
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver for components that might use it
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

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

// Mock DOMMatrix for PDF.js tests
Object.defineProperty(global, "DOMMatrix", {
  value: class MockDOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;

    toString() {
      return "matrix(1, 0, 0, 1, 0, 0)";
    }
    scale() {
      return this;
    }
    translate() {
      return this;
    }
    rotate() {
      return this;
    }
    inverse() {
      return this;
    }
    multiply() {
      return this;
    }

    static fromFloat32Array() {
      return new MockDOMMatrix();
    }
    static fromFloat64Array() {
      return new MockDOMMatrix();
    }
    static fromMatrix() {
      return new MockDOMMatrix();
    }
  },
  writable: true,
  configurable: true,
});

// Set global test timeout to prevent hangs
vi.setConfig({ testTimeout: 5000, hookTimeout: 5000 });
