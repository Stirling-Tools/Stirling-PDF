import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { QuickNavHostProvider } from "@app/contexts/QuickNavHostContext";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";

vi.mock("@app/services/thumbnailGenerationService", () => ({
  thumbnailGenerationService: { generateThumbnails: vi.fn(async () => []) },
}));

/**
 * The processor's provider stack, which is the point of this file: it has app
 * config and the quick-nav host, and deliberately NO FileContextProvider.
 *
 * Both apps render this bridge, and the file hooks throw outside a provider, so
 * anything here that reaches for files takes the whole processor page down with
 * a "File hooks must be used within a FileContextProvider" crash. That shipped
 * once; this test is here so it cannot ship again.
 */
function renderInProcessorShape() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <AppConfigProvider
          autoFetch={false}
          initialConfig={{ enableEasterEggs: true }}
        >
          <QuickNavHostProvider>
            <QuickNavHostBridge portalAccess onOpenSettings={() => {}} />
          </QuickNavHostProvider>
        </AppConfigProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("QuickNavHostBridge without a FileContextProvider", () => {
  it("mounts, as the processor needs it to", () => {
    expect(() => renderInProcessorShape()).not.toThrow();
  });
});
