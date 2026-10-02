import type {
  SessionSummary,
  SignRequestSummary,
} from "@app/types/signingSession";

export type SigningItem =
  | (SignRequestSummary & { kind: "request" })
  | (SessionSummary & { kind: "session"; ownRequest?: SignRequestSummary });

export type SigningMenuItem = SigningItem & { unread: boolean };

/** One entry per document workflow; owned sessions retain the owner's participant action. */
export function collectSigningItems(
  requests: SignRequestSummary[],
  sessions: SessionSummary[],
): SigningItem[] {
  const items = new Map<string, SigningItem>(
    requests.map((request) => [
      request.sessionId,
      { ...request, kind: "request" },
    ]),
  );
  const requestsById = new Map(
    requests.map((request) => [request.sessionId, request]),
  );
  for (const session of sessions) {
    const ownRequest = requestsById.get(session.sessionId);
    items.set(session.sessionId, {
      ...session,
      kind: "session",
      ...(ownRequest ? { ownRequest } : {}),
      finalized: session.finalized || Boolean(ownRequest?.finalized),
    });
  }
  return [...items.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Participant closure includes access and role restrictions; the owner's workflow can remain active. */
export function isSigningItemClosed(item: SigningItem): boolean {
  return (
    Boolean(item.finalized) ||
    (item.kind === "session" &&
      item.status !== undefined &&
      item.status !== "IN_PROGRESS") ||
    (item.kind === "request" &&
      (item.myStatus === "DECLINED" ||
        Boolean(item.accessExpired) ||
        Boolean(item.closed)))
  );
}

export function needsSignature(item: SigningItem): boolean {
  if (isSigningItemClosed(item)) return false;
  const request = item.kind === "request" ? item : item.ownRequest;
  return (
    request !== undefined &&
    !isSigningItemClosed({ ...request, kind: "request" }) &&
    request.myStatus !== "SIGNED"
  );
}

/** Prioritizes an owner's pending signature, then returns to session management. */
export function getSigningItemToOpen(item: SigningItem): SigningItem {
  return item.kind === "session" && item.ownRequest && needsSignature(item)
    ? { ...item.ownRequest, kind: "request" }
    : item;
}
