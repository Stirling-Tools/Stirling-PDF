/**
 * RUM: web-vitals v5 with attribution (LoAF + INP phase breakdown) wired to
 * PostHog. Each metric is captured as a `web_vitals` event with its rating and
 * attribution so latency regressions can be segmented by release, browser and
 * device in PostHog. PostHog itself is lazily loaded (see posthogLoader) and
 * metrics reported before it loads are dropped, which matches the existing
 * consent guards.
 */
import { onCLS, onINP, onLCP, onTTFB } from "web-vitals/attribution";
import type {
  CLSMetricWithAttribution,
  INPMetricWithAttribution,
  LCPMetricWithAttribution,
  TTFBMetricWithAttribution,
} from "web-vitals/attribution";
import { loadPosthog } from "@app/services/posthogLoader";
import type { PosthogClient } from "@app/services/posthogLoader";

type WebVitalsMetric =
  | CLSMetricWithAttribution
  | INPMetricWithAttribution
  | LCPMetricWithAttribution
  | TTFBMetricWithAttribution;

const DEV = import.meta.env.DEV;

function canCapture(ph: PosthogClient): boolean {
  if (typeof window === "undefined") return false;
  if (!ph.__loaded) return false;
  return (
    typeof ph.has_opted_in_capturing !== "function" ||
    ph.has_opted_in_capturing()
  );
}

async function capture(
  metricName: string,
  metric: WebVitalsMetric,
): Promise<void> {
  try {
    const ph = await loadPosthog();
    if (!ph || !canCapture(ph)) return;
    ph.capture("web_vitals", {
      metric: metricName,
      value: metric.value,
      rating: metric.rating,
      navigation_type: metric.navigationType,
      attribution: metric.attribution,
    });
  } catch (error) {
    if (DEV) console.warn(`[web-vitals] ${metricName} capture failed`, error);
  }
}

export function startWebVitalsRUM(): void {
  onTTFB(
    (metric) => {
      void capture("ttfb", metric);
    },
    { reportAllChanges: false },
  );
  onLCP((metric) => {
    void capture("lcp", metric);
  });
  onINP((metric) => {
    void capture("inp", metric);
  });
  onCLS((metric) => {
    void capture("cls", metric);
  });
}
