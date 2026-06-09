import { useState } from "react";
import { Button } from "@mantine/core";
import { usePlans } from "@app/hooks/usePlans";
import apiClient from "@app/services/apiClient";

interface TrialStatus {
  isTrialing: boolean;
  trialEnd: string;
  daysRemaining: number;
  hasPaymentMethod: boolean;
  hasScheduledSub: boolean;
}

export function ManageBillingButton({
  returnUrl = typeof window !== "undefined" ? window.location.href : "/",
  children = "Manage billing",
  trialStatus,
}: {
  returnUrl?: string;
  children?: React.ReactNode;
  trialStatus?: TrialStatus;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data } = usePlans();

  // Hide for free plan users
  if (!data || data.currentPlan.id === "free") {
    return null;
  }

  // Hide for trial users who haven't scheduled a subscription yet
  if (trialStatus?.isTrialing && !trialStatus.hasScheduledSub) {
    return null;
  }

  const onClick = async () => {
    setLoading(true);
    setErr(null);
    try {
      // Routes through POST /api/v1/payg/portal-session — the Java controller centralises
      // authorisation (team membership + subscription state), validates returnUrl against the
      // configured host allowlist, and short-circuits free-tier teams with 404 TEAM_NOT_SUBSCRIBED
      // before the Supabase edge fn is even called. The previous direct supabase.functions.invoke
      // call bypassed all of that.
      const resp = await apiClient.post<{ url?: string; error?: string }>(
        "/api/v1/payg/portal-session",
        { returnUrl },
      );
      const portalUrl = resp.data?.url;
      if (!portalUrl) {
        throw new Error(resp.data?.error ?? "No portal URL");
      }
      window.location.href = portalUrl;
    } catch (e: unknown) {
      // Axios error response body shape mirrors the controller's status map (PORTAL_UNAVAILABLE,
      // PORTAL_NOT_CONFIGURED, TEAM_NOT_SUBSCRIBED, INVALID_RETURN_URL).
      const responseBody = (e as { response?: { data?: { error?: string } } })?.response?.data;
      const code = responseBody?.error;
      const message =
        code === "TEAM_NOT_SUBSCRIBED"
          ? "Subscribe first to manage billing"
          : code === "INVALID_RETURN_URL"
            ? "Could not open billing portal: invalid return URL"
            : code === "PORTAL_NOT_CONFIGURED"
              ? "Billing portal is not configured"
              : e instanceof Error
                ? e.message
                : "Could not open billing portal";
      setErr(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button
        onClick={onClick}
        disabled={loading}
        className="px-4 py-2 rounded bg-black text-white"
      >
        {loading ? "Opening…" : children}
      </Button>
      {err && <div className="mt-2 text-red-600">{err}</div>}
    </div>
  );
}
