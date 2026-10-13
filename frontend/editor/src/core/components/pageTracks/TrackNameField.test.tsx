import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { TrackNameField } from "@app/components/pageTracks/TrackNameField";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

function show(onRename = vi.fn().mockResolvedValue(undefined)) {
  render(
    <MantineProvider env="test">
      <TrackNameField name="report.pdf" onRename={onRename} />
    </MantineProvider>,
  );
  return { onRename };
}

async function startEditing() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Rename file" }));
  const input = screen.getByRole("textbox", { name: "File name" });
  await user.clear(input);
  return { user, input };
}

describe("TrackNameField", () => {
  it("submits the new name, keeping the extension, on Enter", async () => {
    const { onRename } = show();
    const { user } = await startEditing();

    await user.keyboard("summary{Enter}");

    expect(onRename).toHaveBeenCalledExactlyOnceWith("summary.pdf");
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
  });

  it("cancels on Escape without renaming", async () => {
    const { onRename } = show();
    const { user } = await startEditing();

    await user.keyboard("summary{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("stays open when the name has an illegal character", async () => {
    const { onRename } = show();
    const { user, input } = await startEditing();

    await user.keyboard("a/b{Enter}");

    expect(onRename).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("stays open with the message when the rename fails", async () => {
    show(vi.fn().mockRejectedValue(new Error("Disk full")));
    const { user, input } = await startEditing();

    await user.keyboard("summary{Enter}");

    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Disk full")).toBeInTheDocument();
  });
});
