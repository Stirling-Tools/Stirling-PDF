package stirling.software.saas.procurement.pricing;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

/**
 * The canonical enterprise pricing engine — the single server-side definition the quote builder,
 * the order form, and the Stripe checkout all derive from. A faithful port of the marketing
 * prototype's {@code quotePricing}:
 *
 * <pre>
 *   annual        = volume x perPdfRate x serviceLevelMult x (indemnification ? 1.05 : 1)
 *   annualNet     = round(annual x (1 - termDiscount)) + qbr
 *   tcv           = annualNet x termYears + training
 * </pre>
 *
 * The multi-year discount applies to usage + service level + indemnification, but NOT to the flat
 * QBR fee (added after), and one-time training sits outside the recurring total. All money is in
 * minor units (cents). Rates come from {@link PricingRates} (Stripe-backed in prod).
 */
@Service
public class ProcurementPricingService {

    /** Bespoke/committed deals don't price below this ACV; the builder floors against it. */
    public static final long MIN_ACV_MINOR = 5_000_000L; // $50,000

    /**
     * Estimated annual PDF volume from seat count (~2,012.5 PDFs/user/yr = 5 docs/day x 230 working
     * days x 1.75), used to prefill the builder's volume step. Rounded, matching the prototype's
     * {@code users x 5 x 230 x 1.75}.
     */
    public long estimateAnnualVolume(int users) {
        return Math.round(Math.max(0, users) * 5.0 * 230.0 * 1.75);
    }

    public QuoteBreakdown price(QuoteConfig cfg) {
        return price(cfg, PricingRates.defaults());
    }

    public QuoteBreakdown price(QuoteConfig cfg, PricingRates rates) {
        // Never trust the client's volume: clamp to non-negative so a tampered request can't drive
        // a
        // negative amount. The rate card and formula are server-side, so the browser can't lower
        // the
        // price — only pick a smaller, legitimate config. (See MIN_ACV_MINOR for the committed
        // floor,
        // a policy decision that is intentionally not force-applied here — see the review notes.)
        long volume = Math.max(0, cfg.volume());
        long perPdf = rates.perPdfMinor(volume);
        long usage = Math.round(volume * (double) perPdf); // base, pre-service-level
        double slaUplift = rates.serviceLevelUplift(cfg.serviceLevel());
        long withSla = Math.round(usage * (1.0 + slaUplift));
        long withIndemnity =
                cfg.indemnification()
                        ? Math.round(withSla * (1.0 + rates.indemnificationUplift()))
                        : withSla;

        double termDiscount = rates.termDiscount(cfg.termYears());
        long discount = Math.round(withIndemnity * termDiscount);
        long qbr = cfg.qbr() ? rates.qbrAnnualMinor() : 0L;
        long training = cfg.training() ? rates.trainingOneTimeMinor() : 0L;

        long annualNet = (withIndemnity - discount) + qbr;
        long tcv = annualNet * cfg.termYears() + training;

        List<QuoteLineItem> lines = new ArrayList<>();
        lines.add(
                new QuoteLineItem("usage", "PDF processing", QuoteLineItem.Kind.RECURRING, usage));
        lines.add(
                new QuoteLineItem(
                        "seats",
                        "Unlimited users + SSO / SCIM / RBAC",
                        QuoteLineItem.Kind.INCLUDED,
                        0L));
        if (withSla != usage) {
            lines.add(
                    new QuoteLineItem(
                            "service-level",
                            serviceLevelLabel(cfg.serviceLevel()),
                            QuoteLineItem.Kind.RECURRING,
                            withSla - usage));
        }
        if (withIndemnity != withSla) {
            lines.add(
                    new QuoteLineItem(
                            "indemnification",
                            "IP indemnification",
                            QuoteLineItem.Kind.RECURRING,
                            withIndemnity - withSla));
        }
        if (qbr > 0) {
            lines.add(
                    new QuoteLineItem(
                            "qbr",
                            "Quarterly business reviews",
                            QuoteLineItem.Kind.RECURRING,
                            qbr));
        }
        if (discount > 0) {
            lines.add(
                    new QuoteLineItem(
                            "multi-year",
                            cfg.termYears() + "-year commitment",
                            QuoteLineItem.Kind.DISCOUNT,
                            -discount));
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

    private static String serviceLevelLabel(String serviceLevel) {
        if ("priority".equalsIgnoreCase(serviceLevel)) return "Priority service level";
        if ("dedicated".equalsIgnoreCase(serviceLevel)) return "Dedicated service level";
        return "Standard service level";
    }
}
