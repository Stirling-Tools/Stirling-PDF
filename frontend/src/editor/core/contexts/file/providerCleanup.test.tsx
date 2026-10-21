import "fake-indexeddb/auto";
import { StrictMode, useEffect, useRef } from "react";
import { act, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, it, vi } from "vitest";
import { FileContextProvider, useFileActions } from "@app/contexts/FileContext";

function OwnedResource({ url }: { url: string }) {
  const { actions } = useFileActions();
  const registered = useRef(false);
  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    actions.trackBlobUrl(url);
  }, [actions, url]);
  return null;
}

it("keeps owned resources through effect replay and releases them on unmount", async () => {
  const url = "blob:owned-file-resource";
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  try {
    const { unmount } = render(
      <StrictMode>
        <MantineProvider>
          <FileContextProvider>
            <OwnedResource url={url} />
          </FileContextProvider>
        </MantineProvider>
      </StrictMode>,
    );
    await act(async () => {});
    expect(revoke).not.toHaveBeenCalledWith(url);

    unmount();
    await act(async () => {});
    expect(
      revoke.mock.calls.filter(([revoked]) => revoked === url),
    ).toHaveLength(1);
  } finally {
    revoke.mockRestore();
  }
});
