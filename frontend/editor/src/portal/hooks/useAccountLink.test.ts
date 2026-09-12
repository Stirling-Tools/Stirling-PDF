import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetchStatus: vi.fn(),
  unlinkInstance: vi.fn(),
  clearAccountLinkSession: vi.fn(),
  applyLinkFacts: vi.fn(),
  markStatusKnown: vi.fn(),
}));
vi.mock("@portal/api/link", () => ({
  fetchStatus: mocks.fetchStatus,
  unlinkInstance: mocks.unlinkInstance,
}));
vi.mock("@portal/auth/saasSupabase", () => ({
  isSaasSupabaseConfigured: true,
}));
vi.mock("@portal/auth/accountLinkSession", () => ({
  clearAccountLinkSession: mocks.clearAccountLinkSession,
}));
vi.mock("@portal/contexts/LinkContext", () => ({
  useApplyLinkFacts: () => mocks.applyLinkFacts,
  useLink: () => ({ markStatusKnown: mocks.markStatusKnown }),
}));
import { useAccountLink } from "@portal/hooks/useAccountLink";

beforeEach(() => {
  vi.clearAllMocks();
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
