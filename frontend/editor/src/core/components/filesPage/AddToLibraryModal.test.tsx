import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddToLibraryModal } from "@app/components/filesPage/AddToLibraryModal";
import type { StirlingFileStub } from "@app/types/fileContext";

const state = vi.hoisted(() => ({
  move: vi.fn(),
  alert: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@app/contexts/FilesPageContext", () => ({
  useFilesPage: () => ({ moveFilesTo: state.move }),
}));
vi.mock("@app/components/toast", () => ({
  alert: state.alert,
  dismissToast: state.dismiss,
}));
vi.mock("@app/components/filesPage/LibraryFilePicker", () => ({
  LibraryFilePicker: ({
    destination,
  }: {
    destination: { onConfirm: (id: null) => void };
  }) => <button onClick={() => destination.onConfirm(null)}>Add here</button>,
}));

describe("library destination confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.alert.mockReturnValue("progress");
  });

  it("closes immediately while the upload continues, then dismisses progress", async () => {
    let finishUpload!: () => void;
    state.move.mockReturnValue(
      new Promise<void>((resolve) => {
        finishUpload = resolve;
      }),
    );
    const close = vi.fn();
    render(
      <MantineProvider>
        <AddToLibraryModal
          files={[{ id: "one" } as StirlingFileStub]}
          onClose={close}
        />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add here" }));
    expect(close).toHaveBeenCalledOnce();
    expect(state.move).toHaveBeenCalledWith(["one"], null, {
      uploadToRoot: true,
    });
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(
      state.move.mock.invocationCallOrder[0],
    );
    expect(state.dismiss).not.toHaveBeenCalled();
    await act(async () => finishUpload());
    await waitFor(() => expect(state.dismiss).toHaveBeenCalledWith("progress"));
    expect(state.alert).toHaveBeenLastCalledWith(
      expect.objectContaining({ alertType: "success" }),
    );
  });

  it("reports failed files outside the dismissed picker", async () => {
    state.move.mockRejectedValue(new Error("Missing.pdf: File unavailable"));
    const close = vi.fn();
    render(
      <MantineProvider>
        <AddToLibraryModal
          files={[{ id: "one" } as StirlingFileStub]}
          onClose={close}
        />
      </MantineProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add here" }));
    await waitFor(() =>
      expect(state.alert).toHaveBeenLastCalledWith(
        expect.objectContaining({
          alertType: "error",
          body: "Missing.pdf: File unavailable",
        }),
      ),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(state.dismiss).toHaveBeenCalledWith("progress");
  });
});
