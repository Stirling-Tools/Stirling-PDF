import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetchStatus: vi.fn(),
  isOwner: true,
  unlinkInstance: vi.fn(),
  clearAccountLinkSession: vi.fn(),
  applyLinkFacts: vi.fn(),
  markStatusKnown: vi.fn(),
}));
vi.mock("@app/portal/hooks/useAccountLinkOwner", () => ({
  useAccountLinkOwner: () => mocks.isOwner,
}));
vi.mock("@app/portal/api/link", () => ({
  fetchStatus: mocks.fetchStatus,
  unlinkInstance: mocks.unlinkInstance,
}));
vi.mock("@app/portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
}));
vi.mock("@app/portal/auth/accountLinkSession", () => ({
  clearAccountLinkSession: mocks.clearAccountLinkSession,
}));
vi.mock("@app/portal/contexts/LinkContext", () => ({
  useApplyLinkFacts: () => mocks.applyLinkFacts,
  useLink: () => ({ markStatusKnown: mocks.markStatusKnown }),
}));
import { useAccountLink } from "@app/portal/hooks/useAccountLink";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isOwner = true;
  mocks.fetchStatus.mockResolvedValue({ linked: true, name: "QA" });
  mocks.unlinkInstance.mockResolvedValue(undefined);
});
it("clears browser authorization only after the server confirms unlinking", async () => {
  const { result } = renderHook(() => useAccountLink());
  await waitFor(() => expect(result.current.status?.linked).toBe(true));
  await act(async () => {
    await result.current.unlink();
  });
  expect(mocks.unlinkInstance).toHaveBeenCalledOnce();
  expect(mocks.clearAccountLinkSession).toHaveBeenCalledOnce();
  expect(result.current.status?.linked).toBe(false);
  expect(mocks.applyLinkFacts).toHaveBeenLastCalledWith(false, false);
});
it("retains browser authorization if unlinking fails", async () => {
  mocks.unlinkInstance.mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useAccountLink());
  await waitFor(() => expect(result.current.status?.linked).toBe(true));
  await act(async () => {
    await result.current.unlink();
  });
  expect(mocks.clearAccountLinkSession).not.toHaveBeenCalled();
  expect(result.current.status?.linked).toBe(true);
  expect(result.current.error).toBe("offline");
});

it("makes no account-link requests for a non-owner, even when refresh or unlink is called", async () => {
  mocks.isOwner = false;
  const { result } = renderHook(() => useAccountLink());
  await act(async () => {
    await result.current.refresh();
    await result.current.unlink();
  });
  expect(mocks.fetchStatus).not.toHaveBeenCalled();
  expect(mocks.unlinkInstance).not.toHaveBeenCalled();
  expect(mocks.clearAccountLinkSession).not.toHaveBeenCalled();
});
