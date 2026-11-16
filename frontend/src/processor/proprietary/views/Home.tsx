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
    <div className="portal-home">
      {/* Paid tiers open with a greeting; free opens with local deployment status. */}
      {tier !== "free" && <HomeGreeting />}

      <HomeHero />
      <ProcessorFlow />
    </div>
  );
}
