import type {
  SessionSummary,
  SignRequestSummary,
} from "@app/types/signingSession";

export type SigningItem =
  | (SignRequestSummary & { kind: "request" })
  | (SessionSummary & { kind: "session" });

export type SigningMenuItem = SigningItem & { unread: boolean };

/** One entry per session and role; an owner who also signs keeps both actions. */
export function collectSigningItems(
  requests: SignRequestSummary[],
  sessions: SessionSummary[],
): SigningItem[] {
  const items: SigningItem[] = [
    ...requests.map((request) => ({ ...request, kind: "request" as const })),
    ...sessions.map((session) => ({ ...session, kind: "session" as const })),
  ];
  return [
    ...new Map(
      items.map((item) => [`${item.kind}:${item.sessionId}`, item]),
    ).values(),
  ].sort(
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
  return (
    item.kind === "request" &&
    !isSigningItemClosed(item) &&
    item.myStatus !== "SIGNED"
  );
}
