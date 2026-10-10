import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordPromptModal } from "@app/tools/pdfTextEditor/components/PasswordPromptModal";

describe("password retry dismissal", () => {
  it("blocks every dismissal while loading and enables them after loading", () => {
    const onCancel = vi.fn();
    const prompt = { fileName: "locked.pdf", retry: false };
    const modal = (loading: boolean) => (
      <MantineProvider env="test">
        <PasswordPromptModal
          prompt={prompt}
          loading={loading}
          onSubmit={vi.fn()}
          onCancel={onCancel}
        />
      </MantineProvider>
    );
    const { rerender } = render(modal(true));
    expect(screen.getByTestId("pdf-editor-password-cancel")).toBeDisabled();
    expect(document.querySelector(".mantine-Modal-close")).toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    const overlay = document.querySelector(".mantine-Modal-overlay");
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);
    expect(onCancel).not.toHaveBeenCalled();

    rerender(modal(false));
    expect(screen.getByTestId("pdf-editor-password-cancel")).toBeEnabled();
    fireEvent.click(document.querySelector(".mantine-Modal-close")!);
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.click(document.querySelector(".mantine-Modal-overlay")!);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });
});
