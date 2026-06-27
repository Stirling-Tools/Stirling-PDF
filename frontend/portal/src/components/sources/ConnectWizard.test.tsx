import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpError } from "@portal/api/http";
import { ConnectWizard } from "@portal/components/sources/ConnectWizard";

// Deterministic i18n: keys come back verbatim so the test never waits on the
// async TOML backend.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// Mock the service layer so no real fetch is issued.
const createSource = vi.fn();
vi.mock("@portal/api/sources", () => ({
  createSource: (...args: unknown[]) => createSource(...args),
}));

/** Step through the folder-source flow: choose type -> configure -> review. */
function stepToReview() {
  // Step 0: folder is the default-selected type. Continue.
  fireEvent.click(screen.getByText("sources.wizard.continue"));

  // Step 1: fill the required name + directory fields.
  const inputs = screen.getAllByRole("textbox");
  // First textbox is the name field, second is the folder's directory field.
  fireEvent.change(inputs[0], { target: { value: "Claims intake" } });
  fireEvent.change(inputs[1], { target: { value: "/data/incoming" } });
  fireEvent.click(screen.getByText("sources.wizard.continue"));
}

describe("ConnectWizard", () => {
  beforeEach(() => {
    createSource.mockReset();
  });

  it("creates a folder source with the configured options", async () => {
    createSource.mockResolvedValue({ id: "src-1" });
    const onCreated = vi.fn();
    const onClose = vi.fn();

    render(<ConnectWizard open onClose={onClose} onCreated={onCreated} />);

    stepToReview();

    // Step 2: submit via the final "connect source" action.
    fireEvent.click(screen.getByText("sources.actions.connectSource"));

    await waitFor(() => {
      expect(createSource).toHaveBeenCalledTimes(1);
    });
    expect(createSource).toHaveBeenCalledWith({
      name: "Claims intake",
      type: "folder",
      options: { directory: "/data/incoming", mode: "consume" },
      enabled: true,
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
  });

  it("edits an existing source: prefilled, skips type, submits with its id", async () => {
    createSource.mockResolvedValue({ id: "s1" });
    const onCreated = vi.fn();

    render(
      <ConnectWizard
        open
        source={{
          id: "s1",
          name: "James",
          type: "folder",
          options: { directory: "'/data/in'", mode: "consume" },
          enabled: true,
        }}
        onClose={vi.fn()}
        onCreated={onCreated}
      />,
    );

    // Edit opens on the configure step with name + directory prefilled.
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs[0].value).toBe("James");
    expect(inputs[1].value).toBe("'/data/in'");

    // Fix the stray quotes, continue to review, save.
    fireEvent.change(inputs[1], { target: { value: "/data/in" } });
    fireEvent.click(screen.getByText("sources.wizard.continue"));
    fireEvent.click(screen.getByText("sources.wizard.save"));

    await waitFor(() => {
      expect(createSource).toHaveBeenCalledTimes(1);
    });
    expect(createSource).toHaveBeenCalledWith({
      id: "s1",
      name: "James",
      type: "folder",
      options: { directory: "/data/in", mode: "consume" },
      enabled: true,
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
  });

  it("renders the inline error message when create fails", async () => {
    createSource.mockRejectedValue(
      new HttpError(400, "Bad Request", {
        detail: "Directory is not readable",
      }),
    );

    render(<ConnectWizard open onClose={vi.fn()} onCreated={vi.fn()} />);

    stepToReview();
    fireEvent.click(screen.getByText("sources.actions.connectSource"));

    expect(
      await screen.findByText("Directory is not readable"),
    ).toBeInTheDocument();
  });
});
