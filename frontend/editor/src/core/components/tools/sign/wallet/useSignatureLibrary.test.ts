import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSignatureLibrary } from "@app/components/tools/sign/wallet/useSignatureLibrary";
import type {
  CreatedSignature,
  SaveChoice,
} from "@app/components/tools/sign/createSignature/types";
import type { SavedSignature } from "@app/types/signature";

const mocks = vi.hoisted(() => ({
  addSignature: vi.fn(),
  removeSignature: vi.fn(),
  updateSignatureLabel: vi.fn(),
  setDefaultId: vi.fn(),
  alert: vi.fn(),
  ownCount: 0,
  defaultId: "saved",
}));

vi.mock("@app/components/toast", () => ({ alert: mocks.alert }));
vi.mock("@app/hooks/tools/sign/useDefaultSignature", () => ({
  useDefaultSignature: () => ({
    defaultId: mocks.defaultId,
    setDefaultId: mocks.setDefaultId,
  }),
}));
vi.mock("@app/hooks/tools/sign/useSavedSignatures", () => ({
  useSavedSignatures: () => ({
    savedSignatures: [],
    ownCount: mocks.ownCount,
    maxLimit: 20,
    isLoading: false,
    isAtCapacity: mocks.ownCount >= 20,
    storageType: "backend",
    isAdmin: true,
    addSignature: mocks.addSignature,
    removeSignature: mocks.removeSignature,
    updateSignatureLabel: mocks.updateSignatureLabel,
  }),
}));

const signature: SavedSignature = {
  id: "saved",
  type: "text",
  dataUrl: "data:image/png;base64,name",
  label: "Name",
  scope: "personal",
  signerName: "Alex Brown",
  fontFamily: "Caveat",
  fontSize: 120,
  textColor: "#111111",
  createdAt: 1,
  updatedAt: 1,
};
const created: CreatedSignature = {
  source: "type",
  type: "text",
  dataUrl: signature.dataUrl,
  text: {
    signerName: signature.signerName,
    fontFamily: signature.fontFamily,
    fontSize: 120,
    textColor: "#111111",
  },
  initials: {
    signerName: "AB",
    fontFamily: "Caveat",
    fontSize: 120,
    textColor: "#111111",
    dataUrl: "data:image/png;base64,initials",
  },
};
const choice: SaveChoice = {
  label: "Name",
  scope: "personal",
  makeDefault: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ownCount = 0;
  mocks.defaultId = "saved";
  mocks.addSignature.mockResolvedValue({ success: true, signature });
  mocks.removeSignature.mockResolvedValue(true);
  mocks.updateSignatureLabel.mockResolvedValue(true);
});

describe("signature library failures", () => {
  it("does not partially save a requested pair when only one slot remains", async () => {
    mocks.ownCount = 19;
    const { result } = renderHook(useSignatureLibrary);
    expect(await result.current.save(created, choice)).toBeNull();
    expect(mocks.addSignature).not.toHaveBeenCalled();
    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: "error" }),
    );
  });

  it("saves shared signatures and initials without using personal capacity", async () => {
    mocks.ownCount = 20;
    const { result } = renderHook(useSignatureLibrary);
    expect(
      await result.current.save(created, { ...choice, scope: "shared" }),
    ).not.toBeNull();
    expect(mocks.addSignature).toHaveBeenCalledTimes(2);
    expect(
      mocks.addSignature.mock.calls.every((call) => call[2] === "shared"),
    ).toBe(true);
  });

  it("does not save initials when saving the main signature fails", async () => {
    mocks.addSignature.mockResolvedValueOnce({
      success: false,
      reason: "invalid",
    });
    const { result } = renderHook(useSignatureLibrary);
    expect(await result.current.save(created, choice)).toBeNull();
    expect(mocks.addSignature).toHaveBeenCalledTimes(1);
    expect(mocks.setDefaultId).not.toHaveBeenCalled();
  });

  it("rolls back the main signature when saving initials fails", async () => {
    mocks.addSignature
      .mockResolvedValueOnce({ success: true, signature })
      .mockResolvedValueOnce({ success: false, reason: "invalid" });
    const { result } = renderHook(useSignatureLibrary);
    expect(await result.current.save(created, choice)).toBeNull();
    expect(mocks.removeSignature).toHaveBeenCalledWith("saved");
    expect(mocks.setDefaultId).not.toHaveBeenCalled();
    expect(mocks.alert).not.toHaveBeenCalledWith(
      expect.objectContaining({ alertType: "success" }),
    );
  });

  it("keeps an actually saved signature visible when rollback fails", async () => {
    mocks.addSignature
      .mockResolvedValueOnce({ success: true, signature })
      .mockResolvedValueOnce({ success: false, reason: "invalid" });
    mocks.removeSignature.mockResolvedValue(false);
    const { result } = renderHook(useSignatureLibrary);
    expect((await result.current.save(created, choice))?.key).toBe("saved");
    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: "error" }),
    );
  });

  it("preserves the default when deletion fails", async () => {
    mocks.removeSignature.mockResolvedValue(false);
    const { result } = renderHook(useSignatureLibrary);
    expect(await result.current.remove(signature)).toBe(false);
    expect(mocks.setDefaultId).not.toHaveBeenCalled();
  });

  it("reports a failed rename", async () => {
    mocks.updateSignatureLabel.mockResolvedValue(false);
    const { result } = renderHook(useSignatureLibrary);
    expect(await result.current.rename(signature, "Renamed")).toBe(false);
    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: "error" }),
    );
  });

  it("keeps a draft available after a failed save", async () => {
    mocks.addSignature.mockResolvedValue({ success: false, reason: "invalid" });
    const { result } = renderHook(useSignatureLibrary);
    act(() => result.current.keepUnsaved(created, "Draft"));
    await act(async () => {
      await result.current.saveDraft();
    });
    expect(result.current.draft?.label).toBe("Draft");
  });
});
