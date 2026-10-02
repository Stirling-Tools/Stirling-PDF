import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  hasUnseenSigningActivity,
  markSigningItemSeen,
  subscribeSigningSeen,
} from "@app/services/signingSeenStore";
import { collectSigningItems, type SigningItem } from "@app/utils/signingItems";

const session: SigningItem = {
  kind: "session",
  sessionId: "owned",
  documentName: "Private.pdf",
  createdAt: "2026-10-01",
  participantCount: 2,
  signedCount: 0,
  finalized: false,
  participants: [
    { id: 1, status: "VIEWED", lastUpdated: "2026-10-01T10:00:00" },
    { id: 2, status: "PENDING", lastUpdated: "2026-10-01T10:00:00" },
  ],
};
const request: SigningItem = {
  kind: "request",
  sessionId: "owned",
  documentName: "Private.pdf",
  createdAt: "2026-10-01",
  ownerUsername: "Owner",
  dueDate: "",
  myStatus: "PENDING",
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("counts both roles once and clears both notifications when the combined session is read", () => {
  const signed = {
    ...session,
    signedCount: 1,
    participants: [
      { id: 2, status: "SIGNED" as const, lastUpdated: "2026-10-01T11:00:00" },
    ],
  };
  const items = collectSigningItems([request], [signed]);
  expect(
    items.filter((item) => hasUnseenSigningActivity("alice", item)),
  ).toHaveLength(1);
  markSigningItemSeen("alice", items[0]);
  expect(hasUnseenSigningActivity("alice", request)).toBe(false);
  expect(hasUnseenSigningActivity("alice", items[0])).toBe(false);
  expect(hasUnseenSigningActivity("bob", items[0])).toBe(true);
  const [later] = collectSigningItems(
    [request],
    [
      {
        ...signed,
        signedCount: 2,
        participants: [
          ...signed.participants,
          { id: 1, status: "SIGNED", lastUpdated: "2026-10-01T12:00:00" },
        ],
      },
    ],
  );
  expect(hasUnseenSigningActivity("alice", later)).toBe(true);
});

it("does not notify for expired access even if the invitation has never been opened", () => {
  expect(hasUnseenSigningActivity("alice", { ...request, closed: true })).toBe(
    false,
  );
  expect(
    hasUnseenSigningActivity("alice", { ...request, accessExpired: true }),
  ).toBe(false);
  expect(
    hasUnseenSigningActivity("alice", { ...request, dueDate: "2000-01-01" }),
  ).toBe(true);
});

it("flags new requests until successfully viewed, separately for each account and role", () => {
  expect(hasUnseenSigningActivity("alice", request)).toBe(true);
  markSigningItemSeen("alice", session);
  expect(hasUnseenSigningActivity("alice", request)).toBe(true);
  markSigningItemSeen("alice", request);
  expect(hasUnseenSigningActivity("alice", request)).toBe(false);
  expect(hasUnseenSigningActivity("bob", request)).toBe(true);
  expect(hasUnseenSigningActivity(null, request)).toBe(false);
  expect(
    hasUnseenSigningActivity("alice", { ...request, sessionId: "new" }),
  ).toBe(true);
  expect(
    hasUnseenSigningActivity("bob", { ...request, myStatus: "VIEWED" }),
  ).toBe(false);
});

it("detects a signature and a later decline without relying on the signed count changing", () => {
  expect(hasUnseenSigningActivity("alice", session)).toBe(false);
  markSigningItemSeen("alice", session);
  const signed: SigningItem = {
    ...session,
    signedCount: 1,
    participants: [
      { id: 1, status: "SIGNED", lastUpdated: "2026-10-01T11:00:00" },
      session.participants![1],
    ],
  };
  expect(hasUnseenSigningActivity("alice", signed)).toBe(true);
  markSigningItemSeen("alice", signed);
  expect(hasUnseenSigningActivity("alice", signed)).toBe(false);
  const declined: SigningItem = {
    ...signed,
    participants: [
      signed.participants![0],
      { id: 2, status: "DECLINED", lastUpdated: "2026-10-01T12:00:00" },
    ],
  };
  expect(hasUnseenSigningActivity("alice", declined)).toBe(true);
  markSigningItemSeen("alice", declined);
  expect(hasUnseenSigningActivity("alice", declined)).toBe(false);
  markSigningItemSeen("alice", session);
  expect(hasUnseenSigningActivity("alice", declined)).toBe(false);
});

it("distinguishes participant decisions when aggregate counts stay unchanged", () => {
  const first: SigningItem = {
    ...session,
    participants: [
      { id: 1, status: "DECLINED", lastUpdated: "2026-10-01T11:00:00" },
    ],
  };
  markSigningItemSeen("alice", first);
  expect(
    hasUnseenSigningActivity("alice", {
      ...first,
      participants: [
        { id: 2, status: "DECLINED", lastUpdated: "2026-10-01T12:00:00" },
      ],
    }),
  ).toBe(true);
});

it("clears unread activity on ready sessions without requiring finalization", () => {
  const ready: SigningItem = {
    ...session,
    signedCount: 2,
    participants: undefined,
  };
  expect(hasUnseenSigningActivity("alice", ready)).toBe(true);
  markSigningItemSeen("alice", ready);
  expect(hasUnseenSigningActivity("alice", ready)).toBe(false);
  expect(hasUnseenSigningActivity("bob", { ...ready, finalized: true })).toBe(
    false,
  );
  expect(
    hasUnseenSigningActivity("bob", { ...request, myStatus: "DECLINED" }),
  ).toBe(false);
  expect(
    hasUnseenSigningActivity("bob", { ...request, myStatus: "SIGNED" }),
  ).toBe(false);
});

it("persists only decision identifiers and handles malformed stored values", () => {
  markSigningItemSeen("alice", session);
  const key = localStorage.key(0)!;
  expect(localStorage.getItem(key)).not.toContain("Private.pdf");
  localStorage.setItem(key, '{"signedCount":0,"decisions":"invalid"}');
  expect(
    hasUnseenSigningActivity("alice", { ...session, signedCount: 1 }),
  ).toBe(true);
});

it("keeps read state in memory when persistent writes are unavailable", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage disabled");
  });
  markSigningItemSeen("private-mode", request);
  expect(hasUnseenSigningActivity("private-mode", request)).toBe(false);
});

it("keeps cross-tab subscriptions alive when an earlier subscriber unmounts", () => {
  const first = vi.fn();
  const second = vi.fn();
  const stopFirst = subscribeSigningSeen(first);
  const stopSecond = subscribeSigningSeen(second);
  stopFirst();
  window.dispatchEvent(
    new StorageEvent("storage", { key: "stirling.signing.seenActivity.test" }),
  );
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  stopSecond();
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  expect(second).toHaveBeenCalledOnce();
});
