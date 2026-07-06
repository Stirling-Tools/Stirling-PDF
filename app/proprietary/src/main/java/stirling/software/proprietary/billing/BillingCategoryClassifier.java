package stirling.software.proprietary.billing;

/**
 * Pure precedence for bucketing a request into a {@link BillingCategory}, so the SaaS engine and a
 * linked self-hosted instance classify identically. Each backend resolves the three signals from
 * its own types — the automation marker header; an AI-surface signal (a {@code @RequiresFeature}
 * annotation / route on SaaS, a path prefix on the instance); API-key authentication — and this
 * applies the order {@code AUTOMATION → AI → API → BYPASSED}.
 *
 * <p>An AI tool dispatched inside a pipeline / workflow therefore bills as {@code AUTOMATION} (the
 * automation header dominates), while a direct call to it bills as {@code AI}.
 */
public final class BillingCategoryClassifier {

    private BillingCategoryClassifier() {}

    public static BillingCategory classify(boolean automation, boolean ai, boolean apiKey) {
        if (automation) {
            return BillingCategory.AUTOMATION;
        }
        if (ai) {
            return BillingCategory.AI;
        }
        if (apiKey) {
            return BillingCategory.API;
        }
        return BillingCategory.BYPASSED;
    }
}
