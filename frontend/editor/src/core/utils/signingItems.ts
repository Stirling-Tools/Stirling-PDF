import type {
  SessionSummary,
  SignRequestSummary,
} from "@app/types/signingSession";

export type SigningItem =
  | (SignRequestSummary & { kind: "request" })
  | (SessionSummary & { kind: "session" });

export type SigningAction = "sign" | "review" | "finalize";
export type SigningMenuItem = SigningItem & { action: SigningAction | null };

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

/** Ready sessions remain actionable after viewing; partial updates clear when the owner reviews them. */
export function signingAction(
  item: SigningItem,
  lastSeenSignedCount: number,
): SigningAction | null {
  if (item.finalized) return null;
  if (needsSignature(item)) return "sign";
  if (item.kind === "session") {
    if (item.participantCount > 0 && item.signedCount === item.participantCount)
      return "finalize";
    if (item.signedCount > lastSeenSignedCount) return "review";
  }
  return null;
}

export function needsSignature(item: SigningItem): boolean {
  return (
    item.kind === "request" &&
    !item.finalized &&
    item.myStatus !== "SIGNED" &&
    item.myStatus !== "DECLINED"
  );
}
