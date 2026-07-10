package stirling.software.saas.procurement.pricing;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;

/**
 * The canonical enterprise pricing engine (D71) — the single server-side definition the quote
 * builder, the order form, and Stripe checkout all derive from. A faithful port of the marketing
 * prototype's {@code quotePricing}:
 *
 * <pre>
 *   runVol    = volume x intensity            // posture: Essentials x2, Governed x4, Regulated x7
 *   volDisc   = min(0.5, 0.06 x log2(runVol / 1M))   // 6% off the per-run rate per doubling past 1M
 *   rate      = max($0.005, $0.01 x (1 - volDisc))   // continuous curve, floors at half a cent
 *   meterNet  = round(runVol x rate x (1 - termDisc))    // whole dollars; term discounts the meter only
 *   annualNet = meterNet + dedicated + deployment + indemnification + qbr   // needs priced flat
 *   tcv       = annualNet x termYears + training
 * </pre>
 *
 * <p>No volume tiers, no service-level multipliers, no ACV floor — those were the retired model.
 * Deployment (self-hosted / air-gapped) and dedicated support are flat line items at cost basis;
 * SSO / SCIM / RBAC / audit are always included. Money is USD only; amounts are in minor units
 * (cents). Rates come from {@link PricingRates} (Stripe-backed in prod).
 */
@Service
public class ProcurementPricingService {

    private static final double LOG2 = Math.log(2.0);
    private static final long RUN_CURVE_KNEE = 1_000_000L; // discount starts past 1M committed runs

    /**
     * Estimated annual PDF volume from seat count (~2,012.5 PDFs/user/yr = 5 docs/day x 230 working
     * days x 1.75), used to prefill the builder's volume step. Matches the prototype's {@code users
     * x 5 x 230 x 1.75}.
     */
    public long estimateAnnualVolume(int users) {
        return Math.round(Math.max(0, users) * 5.0 * 230.0 * 1.75);
    }

    public QuoteBreakdown price(QuoteConfig cfg) {
        return price(cfg, PricingRates.defaults());
    }

    public QuoteBreakdown price(QuoteConfig cfg, PricingRates rates) {
        // Never trust the client's volume/intensity: clamp so a tampered request can't drive a
        // negative amount. The curve and flat fees are server-side, so the browser can only pick a
        // smaller legitimate config, never a cheaper rate.
        long volume = Math.max(0, cfg.volume());
        int intensity = Math.max(1, cfg.intensity());
        long runVol = volume * (long) intensity;

        // Committed-volume curve: continuous, no cliffs. Floors at the per-run cost + margin.
        double volDisc =
                runVol > RUN_CURVE_KNEE
                        ? Math.min(
                                0.5,
                                rates.discountPerDoubling()
                                        * (Math.log(runVol / (double) RUN_CURVE_KNEE) / LOG2))
                        : 0.0;
        double rate = Math.max(rates.floorRatePerRun(), rates.listRatePerRun() * (1.0 - volDisc));
        double termDisc = rates.termDiscount(cfg.termYears());

        // The meter is a whole-dollar figure (the quote reads in dollars), then minor units.
        long annualBaseMinor = Math.round((double) runVol * rate) * 100L;
        long meterNetMinor = Math.round((double) runVol * rate * (1.0 - termDisc)) * 100L;
        long termDiscountMinor = meterNetMinor - annualBaseMinor; // <= 0

        long support =
                "dedicated".equalsIgnoreCase(cfg.serviceLevel())
                        ? rates.dedicatedSupportMinor()
                        : 0L;
        long deploy = deployFeeMinor(cfg.deployment(), rates);
        long indemnity =
                cfg.indemnification()
                        ? Math.round(meterNetMinor * rates.indemnificationRate())
                        : 0L;
        long qbr = cfg.qbr() ? rates.qbrAnnualMinor() : 0L;
        long training = cfg.training() ? rates.trainingOneTimeMinor() : 0L;

        long annualNet = meterNetMinor + support + deploy + indemnity + qbr;
        long tcv = annualNet * cfg.termYears() + training;

        double effectivePerPdf = rate * intensity; // quotes speak per-PDF-at-posture, never per-run

        List<QuoteLineItem> lines = new ArrayList<>();
        lines.add(
                new QuoteLineItem(
                        "usage",
                        String.format(
                                Locale.ROOT,
                                "PDF processing — %,d PDFs/yr at $%.4f/PDF (%s posture)",
                                volume,
                                effectivePerPdf,
                                postureLabel(intensity)),
                        QuoteLineItem.Kind.RECURRING,
                        annualBaseMinor));
        lines.add(
                new QuoteLineItem(
                        "seats",
                        "Unlimited users + SSO / SCIM / RBAC / audit",
                        QuoteLineItem.Kind.INCLUDED,
                        0L));
        if (termDiscountMinor < 0) {
            lines.add(
                    new QuoteLineItem(
                            "multi-year",
                            cfg.termYears() + "-year commitment",
                            QuoteLineItem.Kind.DISCOUNT,
                            termDiscountMinor));
        }
        if (support > 0) {
            lines.add(
                    new QuoteLineItem(
                            "support",
                            "Dedicated SE / CSM",
                            QuoteLineItem.Kind.RECURRING,
                            support));
        }
        if (deploy > 0) {
            lines.add(
                    new QuoteLineItem(
                            "deployment",
                            deploymentLabel(cfg.deployment()) + " deployment",
                            QuoteLineItem.Kind.RECURRING,
                            deploy));
        }
        if (indemnity > 0) {
            lines.add(
                    new QuoteLineItem(
                            "indemnification",
                            "IP indemnification",
                            QuoteLineItem.Kind.RECURRING,
                            indemnity));
        }
        if (qbr > 0) {
            lines.add(
                    new QuoteLineItem(
                            "qbr",
                            "Quarterly business reviews",
                            QuoteLineItem.Kind.RECURRING,
                            qbr));
        }
        if (training > 0) {
            lines.add(
                    new QuoteLineItem(
                            "training",
                            "Onboarding & training",
                            QuoteLineItem.Kind.ONE_TIME,
                            training));
        }
        return new QuoteBreakdown(lines, annualNet, tcv, cfg.currency());
    }

    private static long deployFeeMinor(String deployment, PricingRates rates) {
        if ("airgap".equalsIgnoreCase(deployment)) return rates.airgapDeployMinor();
        if ("selfhost".equalsIgnoreCase(deployment)) return rates.selfHostDeployMinor();
        return 0L; // cloud (managed) has no deployment fee
    }

    /** Buyer-facing posture name for the intensity (policy count); the demo's POLICY_POSTURES. */
    private static String postureLabel(int intensity) {
        return switch (intensity) {
            case 2 -> "Essentials";
            case 4 -> "Governed";
            case 7 -> "Regulated";
            default -> intensity + "-policy";
        };
    }

    private static String deploymentLabel(String deployment) {
        if ("airgap".equalsIgnoreCase(deployment)) return "Air-gapped";
        if ("selfhost".equalsIgnoreCase(deployment)) return "Self-hosted";
        return "Stirling Cloud";
    }
}
