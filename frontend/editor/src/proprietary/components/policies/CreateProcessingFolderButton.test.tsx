import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProcessingFolderButton } from "@app/components/policies/CreateProcessingFolderButton";

const { signedIn, open } = vi.hoisted(() => ({
  signedIn: { value: true },
  open: vi.fn(),
}));

vi.mock("@app/components/policies/usePoliciesEnabled", () => ({
  usePoliciesEnabled: () => signedIn.value,
}));

vi.mock("@app/hooks/useProcessingFolderCreation", () => ({
  useProcessingFolderCreation: () => ({ open, dialog: null }),
}));

function renderButton() {
  return render(
    <MantineProvider>
      <CreateProcessingFolderButton />
    </MantineProvider>,
  );
}

beforeEach(() => {
  signedIn.value = true;
  open.mockClear();
});

describe("CreateProcessingFolderButton", () => {
  it("opens the creation flow when signed in", () => {
    renderButton();
    const button = screen.getByRole("button");
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("disables the button when signed out", () => {
    signedIn.value = false;
    renderButton();
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(open).not.toHaveBeenCalled();
  });
});
