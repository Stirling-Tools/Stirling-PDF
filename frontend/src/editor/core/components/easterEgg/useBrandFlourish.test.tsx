import { renderHook } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { FileStoreContext } from "@app/contexts/file/contexts";
import type { FileStateStore } from "@app/contexts/file/contexts";
import type { FileContextState } from "@app/types/fileContext";
import { useBrandFlourish } from "@app/components/easterEgg/useBrandFlourish";
import type { ReactNode } from "react";

vi.mock("@app/services/thumbnailGenerationService", () => ({
  thumbnailGenerationService: { generateThumbnails: vi.fn(async () => []) },
}));

/** AppConfigProvider reads through react-query, so it needs a client. */
function configWrapper(
  enableEasterEggs: boolean,
  store?: FileStateStore,
): ({ children }: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={client}>
      <AppConfigProvider autoFetch={false} initialConfig={{ enableEasterEggs }}>
        {store ? (
          <FileStoreContext.Provider value={store}>
            {children}
          </FileStoreContext.Provider>
        ) : (
          children
        )}
      </AppConfigProvider>
    </QueryClientProvider>
  );
}

/** Config only, no file provider: the processor's shape. */
const withConfigOnly = configWrapper(true);
const withFileStore = (store: FileStateStore) => configWrapper(true, store);

function emptyStore(): FileStateStore {
  const getStirlingFileStubs = vi.fn(() => []);
  const getFiles = vi.fn(() => []);
  return {
    // Only the `files` slice is read; the rest of the state is not touched.
    getState: () =>
      ({ files: { ids: [], byId: {} } }) as unknown as FileContextState,
    subscribe: () => () => {},
    selectors: {
      getStirlingFileStubs,
      getFiles,
    } as unknown as FileStateStore["selectors"],
  };
}

describe("useBrandFlourish", () => {
  it("offers no trigger when the feature is switched off", () => {
    const { result } = renderHook(() => useBrandFlourish(), {
      wrapper: configWrapper(false),
    });
    expect(result.current.trigger).toBeUndefined();
    expect(result.current.overlay).toBeNull();
  });

  it("offers a trigger when the feature is on", () => {
    const { result } = renderHook(() => useBrandFlourish(), {
      wrapper: withFileStore(emptyStore()),
    });
    expect(result.current.trigger).toBeTypeOf("function");
  });

  // The processor renders QuickNavHostBridge but mounts no FileContextProvider.
  // Reaching for the file hooks here threw and took the whole page down.
  describe("without a file provider", () => {
    it("mounts without throwing", () => {
      expect(() =>
        renderHook(() => useBrandFlourish(), { wrapper: withConfigOnly }),
      ).not.toThrow();
    });

    it("still opens the game, just with no pages to show", () => {
      const { result } = renderHook(() => useBrandFlourish(), {
        wrapper: withConfigOnly,
      });
      expect(result.current.overlay).toBeNull();

      act(() => result.current.trigger?.(null));
      expect(result.current.overlay).not.toBeNull();
    });
  });

  it("asks the store for the open files when one is mounted", () => {
    const store = emptyStore();
    const { result } = renderHook(() => useBrandFlourish(), {
      wrapper: withFileStore(store),
    });

    act(() => result.current.trigger?.(null));
    expect(result.current.overlay).not.toBeNull();
    expect(store.selectors.getStirlingFileStubs).toHaveBeenCalled();
    expect(store.selectors.getFiles).toHaveBeenCalled();
  });
});
