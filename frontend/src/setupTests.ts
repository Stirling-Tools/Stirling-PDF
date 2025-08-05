import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock i18next for tests
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: vi.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock i18next-http-backend
vi.mock('i18next-http-backend', () => ({
  default: {
    type: 'backend',
    init: vi.fn(),
    read: vi.fn(),
    save: vi.fn(),
  },
}));

// Mock window.URL.createObjectURL and revokeObjectURL for tests
global.URL.createObjectURL = vi.fn(() => 'mocked-url')
global.URL.revokeObjectURL = vi.fn()

// Mock File and Blob API methods that aren't available in jsdom
if (!globalThis.File.prototype.arrayBuffer) {
  globalThis.File.prototype.arrayBuffer = function() {
    // Return a simple ArrayBuffer with some mock data
    const buffer = new ArrayBuffer(8);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3, 4, 5, 6, 7, 8]);
    return Promise.resolve(buffer);
  };
}

if (!globalThis.Blob.prototype.arrayBuffer) {
  globalThis.Blob.prototype.arrayBuffer = function() {
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
Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn().mockImplementation(async (algorithm: string, data: any) => {
        // Always return the mock hash buffer regardless of input
        return mockHashBuffer.slice();
      }),
    },
    getRandomValues: vi.fn().mockImplementation((array: any) => {
      // Mock getRandomValues if needed
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }),
  } as Crypto,
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
}))

// Mock ResizeObserver for Mantine components
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver for components that might use it
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Set global test timeout to prevent hangs
vi.setConfig({ testTimeout: 5000, hookTimeout: 5000 })