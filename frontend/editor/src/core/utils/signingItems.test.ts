import { describe, expect, it } from "vitest";
import {
  collectSigningItems,
  signingAction,
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
  it("classifies pending signatures, unseen owner updates and finalization separately", () => {
    expect(signingAction(request, 0)).toBe("sign");
    expect(signingAction(session, 0)).toBe("review");
    expect(signingAction(session, 1)).toBeNull();
    expect(signingAction({ ...session, signedCount: 2 }, 2)).toBe("finalize");
    expect(
      signingAction({ ...session, participantCount: 0, signedCount: 0 }, 0),
    ).toBeNull();
  });
  it("never counts finalized, declined or submitted participant entries as actions", () => {
    expect(signingAction({ ...request, finalized: true }, 0)).toBeNull();
    expect(signingAction({ ...request, myStatus: "SIGNED" }, 0)).toBeNull();
    expect(signingAction({ ...request, myStatus: "DECLINED" }, 0)).toBeNull();
    expect(signingAction({ ...session, finalized: true }, 0)).toBeNull();
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
      signingItems: [{ ...request, action: "sign" }],
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
    ).toEqual([{ ...request, action: "sign" }]);
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
