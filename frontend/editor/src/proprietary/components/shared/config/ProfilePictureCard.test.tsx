import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

const h = vi.hoisted(() => ({
  maxBytes: 5 * 1024 * 1024,
  upload: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  pictureUrl: null as string | null,
  /** Set by the cropper stub so a test can drive the post-crop upload. */
  cropComplete: null as ((blob: Blob) => void) | null,
}));

vi.mock("@app/services/profilePictureService", () => ({
  MAX_PROFILE_PICTURE_BYTES: h.maxBytes,
  PROFILE_PICTURE_ACCEPT: "image/png,image/jpeg,image/webp",
  uploadProfilePicture: h.upload,
  removeProfilePicture: h.remove,
}));
vi.mock("@app/hooks/useProfilePictureUrl", () => ({
  useProfilePictureUrl: () => h.pictureUrl,
  refreshOwnProfilePicture: h.refresh,
}));
// The real cropper pulls in react-easy-crop and a canvas; the card only cares that it opened.
vi.mock("@app/components/shared/config/ProfilePictureCropper", () => ({
  ProfilePictureCropper: ({
    opened,
    onCropComplete,
  }: {
    opened: boolean;
    onCropComplete: (blob: Blob) => void;
  }) => {
    h.cropComplete = onCropComplete;
    return opened ? <div data-testid="cropper" /> : null;
  },
}));
vi.mock("@app/components/shared/LocalIcon", () => ({
  default: () => <span />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, vars?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(vars?.[name] ?? ""),
      ),
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import ProfilePictureCard from "@app/components/shared/config/ProfilePictureCard";

function renderCard() {
  return render(
    <MantineProvider>
      <ProfilePictureCard displayName="Priya Raman" />
    </MantineProvider>,
  );
}

/** Hands the hidden file input a file of the given nominal size, bypassing the OS dialog. */
function pickFile(sizeBytes: number) {
  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File(["x"], "avatar.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: sizeBytes });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

/** Drives the cropper stub's callback, i.e. everything after the user confirms the crop. */
async function finishCrop() {
  await act(async () => {
    await h.cropComplete?.(new Blob(["x"]));
  });
}

beforeEach(() => {
  h.upload.mockReset();
  h.remove.mockReset();
  h.refresh.mockReset().mockResolvedValue(undefined);
  h.pictureUrl = null;
  h.cropComplete = null;
});

describe("ProfilePictureCard - size gate", () => {
  it("refuses a file over the limit and names the limit in the error", () => {
    renderCard();
    pickFile(h.maxBytes + 1);

    expect(
      screen.getByText("Please choose an image smaller than 5MB."),
    ).toBeInTheDocument();
    // The load-bearing assertion: an oversized file must not reach the cropper or the upload.
    expect(screen.queryByTestId("cropper")).not.toBeInTheDocument();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("lets a file at exactly the limit through to the cropper", () => {
    renderCard();
    pickFile(h.maxBytes);

    expect(screen.getByTestId("cropper")).toBeInTheDocument();
    expect(
      screen.queryByText("Please choose an image smaller than 5MB."),
    ).not.toBeInTheDocument();
  });

  it("clears a previous size error once an acceptable file is picked", () => {
    renderCard();
    pickFile(h.maxBytes + 1);
    expect(
      screen.getByText("Please choose an image smaller than 5MB."),
    ).toBeInTheDocument();

    pickFile(1024);

    expect(
      screen.queryByText("Please choose an image smaller than 5MB."),
    ).not.toBeInTheDocument();
  });
});

describe("ProfilePictureCard - error surface", () => {
  it("shows the server's reason when the upload is rejected", async () => {
    h.upload.mockRejectedValue({
      response: { data: { message: "Unsupported image format" } },
    });
    renderCard();
    pickFile(1024);
    await finishCrop();

    expect(screen.getByText("Unsupported image format")).toBeInTheDocument();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the upload failure carries none", async () => {
    h.upload.mockRejectedValue(new Error("network"));
    renderCard();
    pickFile(1024);
    await finishCrop();

    expect(
      screen.getByText(
        "Could not upload your profile picture. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces a failed removal", async () => {
    h.pictureUrl = "blob:avatar";
    h.remove.mockRejectedValue(new Error("boom"));
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    // Removal is confirmed in a modal, so the destructive click is the one inside it.
    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    });

    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        "Could not remove your profile picture. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("refreshes every consumer after a successful upload", async () => {
    h.upload.mockResolvedValue(undefined);
    renderCard();
    pickFile(1024);
    await finishCrop();

    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
});
