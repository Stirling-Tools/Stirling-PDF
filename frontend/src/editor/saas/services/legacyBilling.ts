import { supabase } from "@app/auth/supabase";
import apiClient from "@app/services/apiClient";
import type {
  LegacySubscription,
  LegacyTeamAllowance,
} from "@app/types/legacyBilling";

const plans: Record<string, LegacySubscription["plan"]> = {
  price_1SBckcP9mY5IAnSneeH0TJHs: "pro",
  price_1SzFCEP9mY5IAnSno62u0Tti: "team",
};
const statuses: LegacySubscription["status"][] = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
];

interface SubscriptionRow {
  id: string;
  price_id: string;
  status: LegacySubscription["status"];
  current_period_end: string | null;
  team_id: number | null;
}

async function fetchTeamAllowance(
  teamId: number,
): Promise<LegacyTeamAllowance | null> {
  try {
    const { data } = await apiClient.get<{
      teamId: number;
      maxSeats: number;
      seatsUsed: number;
    }>(`/api/v1/team/${teamId}`, { suppressErrorToast: true });
    if (
      data.teamId !== teamId ||
      !Number.isSafeInteger(data.maxSeats) ||
      data.maxSeats < 1 ||
      !Number.isSafeInteger(data.seatsUsed) ||
      data.seatsUsed < 0
    )
      return null;
    return {
      teamId,
      usersInUse: data.seatsUsed,
      maxUsers: data.maxSeats >= 2147483647 ? null : data.maxSeats,
    };
  } catch {
    return null;
  }
}

/** Reads only this owner's known legacy prices; Supabase RLS also enforces ownership. */
export async function fetchLegacySubscriptions(
  userId: string,
): Promise<LegacySubscription[]> {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("id, price_id, status, current_period_end, team_id")
    .eq("user_id", userId)
    .in("price_id", Object.keys(plans))
    .in("status", statuses)
    .order("created_at", { ascending: true })
    .returns<SubscriptionRow[]>();
  if (error) throw error;
  const subscriptions: LegacySubscription[] = (data ?? []).flatMap((row) => {
    const plan = plans[row.price_id];
    return plan && statuses.includes(row.status)
      ? [
          {
            id: row.id,
            plan,
            status: row.status,
            currentPeriodEnd: row.current_period_end,
            teamId:
              typeof row.team_id === "number" &&
              Number.isSafeInteger(row.team_id) &&
              row.team_id > 0
                ? row.team_id
                : null,
            teamAllowance: null,
          },
        ]
      : [];
  });
  const teamIds = [
    ...new Set(
      subscriptions.flatMap((subscription) =>
        subscription.teamId == null ? [] : [subscription.teamId],
      ),
    ),
  ];
  const allowances = new Map(
    await Promise.all(
      teamIds.map(
        async (teamId) => [teamId, await fetchTeamAllowance(teamId)] as const,
      ),
    ),
  );
  return subscriptions.map((subscription) => ({
    ...subscription,
    teamAllowance:
      subscription.teamId == null
        ? null
        : (allowances.get(subscription.teamId) ?? null),
  }));
}

/** The edge function resolves the legacy Stripe customer from the session JWT. */
export async function createLegacyPortalSession(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url?: string }>(
    "manage-billing",
    { body: { return_url: window.location.href } },
  );
  if (error) throw error;
  if (!data?.url) throw new Error("Missing Stripe billing portal URL");
  const url = new URL(data.url);
  if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com") {
    throw new Error("Invalid Stripe billing portal URL");
  }
  return url.href;
}
