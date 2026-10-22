import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { expect, it, vi } from "vitest";
import SignControlsPanel from "@app/components/tools/certSign/panels/SignControlsPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("@app/hooks/tools/sign/useSavedSignatures", () => ({
  useSavedSignatures: () => ({
    savedSignatures: [],
    addSignature: vi.fn(),
    removeSignature: vi.fn(),
    isAtCapacity: false,
    byTypeCounts: {},
  }),
}));

it("exposes undo and redo controls and keyboard shortcuts without intercepting form editing", () => {
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  const content = (canUndo: boolean, canRedo: boolean) => (
    <MantineProvider>
      <SignControlsPanel
        signatureConfig={{
          signatureType: "canvas",
          signatureData: "data:image/png;base64,AA==",
        }}
        placementMode={false}
        onPlacementModeChange={vi.fn()}
        onSignatureSelected={vi.fn()}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
      />
      <input aria-label="Name" />
      <div role="dialog">
        <button>Dialog action</button>
      </div>
    </MantineProvider>
  );
  const { rerender } = render(content(true, false));
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(onUndo).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  rerender(content(false, true));
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "Z", metaKey: true, shiftKey: true });
  fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
  expect(onUndo).toHaveBeenCalledTimes(2);
  expect(onRedo).toHaveBeenCalledTimes(3);
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Name" }), {
    key: "z",
    ctrlKey: true,
  });
  fireEvent.keyDown(screen.getByRole("button", { name: "Dialog action" }), {
    key: "z",
    ctrlKey: true,
  });
  expect(onUndo).toHaveBeenCalledTimes(2);
});
