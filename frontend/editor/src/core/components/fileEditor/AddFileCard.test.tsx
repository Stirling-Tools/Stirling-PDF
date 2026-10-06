import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import AddFileCard from "@app/components/fileEditor/AddFileCard";

const mocks = vi.hoisted(() => ({
  openFilesModal: vi.fn(),
  openFilesFromDisk: vi.fn(),
  openFolderCreation: vi.fn(),
  config: { enableMobileScanner: true } as { enableMobileScanner: boolean },
  signedIn: true,
  canCreateFolders: true,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/contexts/FilesModalContext", () => ({
  useFilesModalContext: () => ({ openFilesModal: mocks.openFilesModal }),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: mocks.config }),
}));
vi.mock("@app/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@app/hooks/useProcessingFolderCreation", () => ({
  useProcessingFolderCreation: () => ({
    open: mocks.canCreateFolders ? mocks.openFolderCreation : undefined,
    dialog: null,
  }),
}));
vi.mock("@app/components/policies/usePoliciesEnabled", () => ({
  usePoliciesEnabled: () => mocks.signedIn,
}));
vi.mock("@app/services/openFilesFromDisk", () => ({
  openFilesFromDisk: mocks.openFilesFromDisk,
}));
vi.mock("@app/components/shared/MobileUploadModal", () => ({
  default: ({ opened }: { opened: boolean }) =>
    opened ? <div>mobile upload modal</div> : null,
}));
vi.mock("@app/ui/Logo", () => ({ Logo: () => null }));

function renderCard(onFilesSelected = vi.fn()) {
  render(
    <MantineProvider>
      <AddFileCard onFilesSelected={onFilesSelected} />
    </MantineProvider>,
  );
  return onFilesSelected;
}

describe("AddFileCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config = { enableMobileScanner: true };
    mocks.signedIn = true;
    mocks.canCreateFolders = true;
  });

  test("clicking the page opens the file library", async () => {
    renderCard();
    await userEvent.click(screen.getByTestId("add-file-card"));
    expect(mocks.openFilesModal).toHaveBeenCalledTimes(1);
    expect(mocks.openFilesFromDisk).not.toHaveBeenCalled();
  });

  test("the computer source hands picked files to the workbench", async () => {
    const picked = [new File(["%PDF"], "a.pdf")];
    mocks.openFilesFromDisk.mockResolvedValue(picked);
    const onFilesSelected = renderCard();

    await userEvent.click(
      screen.getByRole("button", { name: "From computer" }),
    );

    await waitFor(() => expect(onFilesSelected).toHaveBeenCalledWith(picked));
    expect(mocks.openFilesModal).not.toHaveBeenCalled();
  });

  test("the library source opens the file library once", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "From library" }));
    expect(mocks.openFilesModal).toHaveBeenCalledTimes(1);
  });

  test("the mobile source opens the mobile upload modal", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "From mobile" }));
    expect(screen.getByText("mobile upload modal")).toBeTruthy();
  });

  test("hides the mobile source when the scanner is off", () => {
    mocks.config = { enableMobileScanner: false };
    renderCard();
    expect(screen.queryByRole("button", { name: "From mobile" })).toBeNull();
  });

  test("hides the folder source in builds without processing", () => {
    mocks.canCreateFolders = false;
    renderCard();
    expect(
      screen.queryByRole("button", { name: "processingFolders.setup.title" }),
    ).toBeNull();
  });

  test("disables the folder source when signed out", () => {
    mocks.signedIn = false;
    renderCard();
    const folder = screen.getByRole("button", {
      name: "processingFolders.setup.title",
    }) as HTMLButtonElement;
    expect(folder.disabled).toBe(true);
  });
});
