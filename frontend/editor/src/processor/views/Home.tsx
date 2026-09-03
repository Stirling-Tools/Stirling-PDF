import { useTier } from "@processor/contexts/TierContext";
import { HomeHero } from "@processor/components/HomeHero";
import { HomeGreeting } from "@processor/components/HomeGreeting";
import { ProcessorFlow } from "@processor/components/ProcessorFlow";
import "@processor/views/Home.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Home view                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

export function Home() {
  const { tier } = useTier();

  return (
    <div className="processor-home">
      {/* Paid tiers open with a greeting; free opens straight with the banner. */}
      {tier !== "free" && <HomeGreeting />}

      {/* Per-tier hero. Its footer is the deal-status hero while a procurement
          deal is underway (a bolt-on to any tier), otherwise the setup checklist. */}
      <HomeHero />
      <ProcessorFlow />
    </div>
  );
}
