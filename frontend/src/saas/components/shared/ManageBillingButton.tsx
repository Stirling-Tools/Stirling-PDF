import { useState } from "react";
import { supabase } from "@app/auth/supabase";
import { Button } from "@mantine/core";
import { usePlans } from "@app/hooks/usePlans";

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
      const { data, error } = await supabase.functions.invoke<{
        url: string;
        error?: string;
      }>("manage-billing", {
        body: {
          name: "Functions",
          return_url: returnUrl,
        },
      });
      if (error) throw error;
      if (!data || "error" in data)
        throw new Error(data?.error ?? "No portal URL");
      window.location.href = data.url;
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not open billing portal");
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
