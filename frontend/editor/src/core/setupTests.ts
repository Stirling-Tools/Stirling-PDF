import "@testing-library/jest-dom";
import { vi } from "vitest";
import { installFailOnConsole } from "@app/tests/failOnConsole";

// jsdom is missing the same APIs WebKit is, so tests must agree with the
// browser. Same module `src/index.tsx` installs.
import "@app/utils/engineShims";

installFailOnConsole();

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

// Mock File and Blob API methods that aren't available in jsdom. jsdom has no
// Blob.prototype.arrayBuffer, and a FileReader-based polyfill never settles
// under fake timers unless the test advances the clock, hanging every blob
// read in timer-frozen tests. Instead the constructor records each blob's
// bytes (string parts UTF-8 encoded, like a real read would) and slice()
// narrows them, so arrayBuffer resolves from a microtask with byte-exact
// content. Blobs from outside the patch (none in practice) keep a FileReader
// fallback.
const RealBlob = globalThis.Blob;
const trackedBlobBytes = new WeakMap<Blob, Uint8Array>();

function concatBlobParts(parts: BlobPart[]): Uint8Array {
  const arrays: Uint8Array[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      arrays.push(new TextEncoder().encode(part));
    } else if (part instanceof ArrayBuffer) {
      arrays.push(new Uint8Array(part));
    } else if (ArrayBuffer.isView(part)) {
      arrays.push(
        new Uint8Array(part.buffer, part.byteOffset, part.byteLength),
      );
    } else if (part instanceof RealBlob) {
      arrays.push(trackedBlobBytes.get(part) ?? new Uint8Array());
    }
  }
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

if (!RealBlob.prototype.arrayBuffer) {
  const RealFile = globalThis.File;
  globalThis.Blob = class extends RealBlob {
    constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      trackedBlobBytes.set(this, concatBlobParts(parts ?? []));
    }
  };

  // new File(...) runs File's own constructor, not Blob's, so track it too;
  // slices of either derive from the tracked parent below.
  globalThis.File = class extends RealFile {
    constructor(parts?: BlobPart[], name?: string, options?: FilePropertyBag) {
      super(parts ?? [], name ?? "", options);
      trackedBlobBytes.set(this, concatBlobParts(parts ?? []));
    }
  };

  // The native File prototype chains straight to the native Blob prototype,
  // bypassing the patched one, so `file instanceof Blob` would be false.
  // Re-parent it: Files keep every native behavior and rejoin the chain.
  Object.setPrototypeOf(RealFile.prototype, globalThis.Blob.prototype);

  const realSlice = RealBlob.prototype.slice;
  RealBlob.prototype.slice = function (
    this: Blob,
    start?: number,
    end?: number,
    contentType?: string,
  ): Blob {
    const out = realSlice.call(this, start, end, contentType);
    const parent = trackedBlobBytes.get(this);
    if (parent) {
      const size = parent.length;
      let from = start ?? 0;
      let to = end ?? size;
      if (from < 0) from = Math.max(size + from, 0);
      else from = Math.min(from, size);
      if (to < 0) to = Math.max(size + to, 0);
      else to = Math.min(to, size);
      trackedBlobBytes.set(
        out,
        parent.slice(Math.min(from, to), Math.max(from, to)),
      );
    }
    return out;
  };

  // Assigned on the real prototype so blobs jsdom itself creates (notably
  // slice() results, which are native instances) see it too.
  RealBlob.prototype.arrayBuffer = function () {
    const tracked = trackedBlobBytes.get(this);
    if (tracked) {
      return Promise.resolve(tracked.slice().buffer as ArrayBuffer);
    }
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

if (!globalThis.File.prototype.arrayBuffer) {
  globalThis.File.prototype.arrayBuffer = globalThis.Blob.prototype.arrayBuffer;
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
  },
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
