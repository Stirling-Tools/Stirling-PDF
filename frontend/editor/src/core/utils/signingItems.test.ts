import { describe, expect, it } from "vitest";
import {
  collectSigningItems,
  isSigningItemClosed,
  needsSignature,
  type SigningItem,
} from "@app/utils/signingItems";
import {
  EMPTY_QUICK_NAV_ACCOUNT,
  updateQuickNavAccount,
} from "@app/contexts/quickNavAccount";
import { getStartupNavigationAction } from "@app/utils/homePageNavigation";

const request: SigningItem = {
  kind: "request",
  sessionId: "request-1",
  documentName: "Agreement.pdf",
  ownerUsername: "Owner",
  createdAt: "2026-09-24",
  dueDate: "",
  myStatus: "PENDING",
};
const session: SigningItem = {
  kind: "session",
  sessionId: "session-1",
  documentName: "Owned.pdf",
  createdAt: "2026-09-25",
  participantCount: 2,
  signedCount: 1,
  finalized: false,
};

describe("signing workspace entry points", () => {
  it("closes server-reported participant restrictions and cancelled or completed workflows", () => {
    expect(isSigningItemClosed({ ...request, closed: true })).toBe(true);
    expect(needsSignature({ ...request, closed: true })).toBe(false);
    expect(isSigningItemClosed({ ...session, status: "CANCELLED" })).toBe(true);
    expect(isSigningItemClosed({ ...session, status: "COMPLETED" })).toBe(true);
    expect(isSigningItemClosed({ ...session, status: "IN_PROGRESS" })).toBe(
      false,
    );
  });
  it("closes expired participant access without closing the owner session or treating due dates as expiry", () => {
    const expired = { ...request, accessExpired: true };
    expect(isSigningItemClosed(expired)).toBe(true);
    expect(needsSignature(expired)).toBe(false);
    expect(isSigningItemClosed({ ...expired, myStatus: "SIGNED" })).toBe(true);
    const overdue = { ...request, dueDate: "2000-01-01", accessExpired: false };
    expect(isSigningItemClosed(overdue)).toBe(false);
    expect(needsSignature(overdue)).toBe(true);
    expect(
      isSigningItemClosed({ ...session, sessionId: request.sessionId }),
    ).toBe(false);
  });
  it("collapses duplicate historical invitations before rendering and filtering", () => {
    expect(collectSigningItems([request, { ...request }], [])).toEqual([
      request,
    ]);
  });
  it("keeps every session and request, including closed items", () => {
    const requests = Array.from({ length: 8 }, (_, index) => ({
      ...request,
      sessionId: `request-${index}`,
    }));
    expect(
      collectSigningItems(requests, [
        session,
        { ...session, sessionId: "closed", finalized: true },
      ]),
    ).toHaveLength(10);
  });
  it("keeps ready and submitted sessions active, with finalized and declined invitations closed", () => {
    expect(isSigningItemClosed(request)).toBe(false);
    expect(isSigningItemClosed({ ...request, myStatus: "SIGNED" })).toBe(false);
    expect(isSigningItemClosed({ ...session, signedCount: 2 })).toBe(false);
    expect(isSigningItemClosed({ ...request, myStatus: "DECLINED" })).toBe(
      true,
    );
    expect(isSigningItemClosed({ ...session, finalized: true })).toBe(true);
  });
  it("keeps an owner's participant action separately addressable", () => {
    const items = collectSigningItems(
      [{ ...request, sessionId: session.sessionId }],
      [session],
    );
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.kind))).toEqual(
      new Set(["request", "session"]),
    );
  });

  it("does not leak session names into another account or after logout", () => {
    const alice = updateQuickNavAccount(EMPTY_QUICK_NAV_ACCOUNT, {
      accountId: "alice",
      signingItems: [{ ...request, unread: true }],
      signingBadge: 1,
    });
    expect(
      updateQuickNavAccount(alice, { accountId: "bob" }).signingItems,
    ).toEqual([]);
    expect(
      updateQuickNavAccount(alice, { accountId: null }).signingItems,
    ).toEqual([]);
    expect(
      updateQuickNavAccount(alice, {
        identity: { displayName: "Alice", profilePictureUrl: null },
      }).signingItems,
    ).toEqual([{ ...request, unread: true }]);
  });

  it("keeps request creation open when an upload adds files", () => {
    expect(getStartupNavigationAction(0, 1, null, "signing")).toBeNull();
    expect(getStartupNavigationAction(1, 2, null, "signing")).toBeNull();
    expect(getStartupNavigationAction(0, 1, null, "viewer")).toEqual({
      workbench: "viewer",
      activeFileIndex: 0,
    });
  });
});
