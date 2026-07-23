import { useTier } from "@portal/contexts/TierContext";
import { HomeHero } from "@portal/components/HomeHero";
import { HomeGreeting } from "@portal/components/HomeGreeting";
import { ProcessorFlow } from "@portal/components/ProcessorFlow";
import "@portal/views/Home.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Home view                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

export function Home() {
  const { tier } = useTier();

  return (
    <div className="portal-home">
      {/* Paid tiers open with a greeting; free opens straight with the banner. */}
      {tier !== "free" && <HomeGreeting />}

      {/* Per-tier hero. Its footer is the deal-status hero while a procurement
          deal is underway (a bolt-on to any tier), otherwise the setup checklist. */}
      <HomeHero tier={tier} />
      <ProcessorFlow />
    </div>
  );
}
