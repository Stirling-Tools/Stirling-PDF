import { describe, expect, it } from "vitest";
import {
  collectSigningItems,
  recentSigningItems,
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
  it("collapses duplicate historical invitations before rendering and filtering", () => {
    expect(collectSigningItems([request, { ...request }], [])).toEqual([
      request,
    ]);
  });
  it("keeps recent owned sessions visible even with a backlog of requests", () => {
    const requests = Array.from({ length: 8 }, (_, index) => ({
      ...request,
      sessionId: `request-${index}`,
    }));
    const recent = recentSigningItems(collectSigningItems(requests, [session]));
    expect(recent).toHaveLength(4);
    expect(recent[1]).toEqual(session);
  });
  it("prioritizes requests needing a signature and omits closed sessions", () => {
    const completed = { ...session, sessionId: "closed", finalized: true };
    const submitted = {
      ...request,
      sessionId: "submitted",
      myStatus: "SIGNED" as const,
    };
    const items = recentSigningItems(
      collectSigningItems([submitted, request], [completed, session]),
    );
    expect(items.map((item) => item.sessionId)).toEqual([
      "request-1",
      "session-1",
      "submitted",
    ]);
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
      signingItems: [request],
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
    ).toEqual([request]);
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
