import type {
  SessionSummary,
  SignRequestSummary,
} from "@app/types/signingSession";

export type SigningItem =
  | (SignRequestSummary & { kind: "request" })
  | (SessionSummary & { kind: "session" });

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

/** Reserve one shortcut for an outstanding signature; keep the others available for recent sessions. */
export function recentSigningItems(items: SigningItem[]): SigningItem[] {
  const active = items.filter((item) => !item.finalized);
  const nextRequest = active.find(needsSignature);
  return (
    nextRequest
      ? [nextRequest, ...active.filter((item) => item !== nextRequest)]
      : active
  ).slice(0, 4);
}

export function needsSignature(item: SigningItem): boolean {
  return (
    item.kind === "request" &&
    !item.finalized &&
    item.myStatus !== "SIGNED" &&
    item.myStatus !== "DECLINED"
  );
}
