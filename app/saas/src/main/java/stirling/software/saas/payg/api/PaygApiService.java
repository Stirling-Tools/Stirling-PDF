package stirling.software.saas.payg.api;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * In-memory mock backend for the PAYG wallet / checkout / cap endpoints.
 *
 * <h2>Why this is a mock</h2>
 *
 * The real PAYG persistence + Stripe wiring lives across two unmerged surfaces:
 *
 * <ul>
 *   <li>SaaS PR <a href="https://github.com/Stirling-Tools/Stirling-PDF-SaaS/pull/300">#300</a> —
 *       adds the {@code payg_subscription_id} + {@code free_tier} columns on {@code
 *       payg_team_extensions}, the {@code payg_meter_event_log} table for usage rollups, and the
 *       Supabase edge functions {@code create-payg-team-subscription} (Checkout Session creator)
 *       and {@code payg-subscription-webhook} (flips subscription state on {@code
 *       customer.subscription.created}).
 *   <li>Stripe Java SDK — not yet added to {@code build.gradle}. Real {@link
 *       PaygApiController#createCheckoutSession} would either use the SDK directly or proxy to the
 *       Supabase edge function above.
 * </ul>
 *
 * <p>Until those land we keep all state in {@link ConcurrentHashMap}s, keyed by a synthetic team
 * key. That gives the frontend a real HTTP round-trip with realistic shapes (and lets us iterate on
 * the modal / Plan-page wiring) without blocking on backend work.
 *
 * <h2>Swap-out plan</h2>
 *
 * <ol>
 *   <li>When PR #300's Supabase migrations land in main: replace {@link #subscriptionStateByTeam}
 *       reads with {@code paygTeamExtensionsRepository.findByTeamId(...)} + the new {@code
 *       payg_subscription_id} column check.
 *   <li>When the Stripe SDK is added: replace {@link #createMockClientSecret} with a real {@code
 *       Session.create(...)} call or an HTTP call to the {@code create-payg-team-subscription} edge
 *       function.
 *   <li>Usage rollups: replace {@link #mockUsageThisPeriod} with a query against {@code
 *       payg_meter_event_log} (sum of {@code units} for the current cycle).
 * </ol>
 */
@Service
@Profile("saas")
@Slf4j
public class PaygApiService {

    /**
     * Free tier monthly billable allowance. Hard-coded for V1; will eventually come from {@code
     * pricing_policy.free_tier_units} once PR #300 lands.
     */
    public static final int FREE_TIER_LIMIT_UNITS = 500;

    /** Subscription state for a single team — kept tiny on purpose. */
    private record SubscriptionState(
            String subscriptionId, int capUsd, boolean noCap, LocalDate subscribedOn) {}

    /**
     * Team-scoped mock storage. Keys are synthetic team identifiers derived from the authenticated
     * principal (see {@link #resolveTeamKey}). NULL value = team has never subscribed.
     */
    private final Map<String, AtomicReference<SubscriptionState>> subscriptionStateByTeam =
            new ConcurrentHashMap<>();

    /** Wallet snapshot DTO returned by {@link PaygApiController#getWallet}. */
    public record WalletSnapshot(
            String status, // "free" | "subscribed"
            String role, // "leader" | "member"
            String billingPeriodStart,
            String billingPeriodEnd,
            int billableUsed,
            int billableLimit,
            Integer capUsd, // null when noCap or status == "free"
            boolean noCap, // only meaningful when status == "subscribed"
            String stripeSubscriptionId, // null when status == "free"
            int spendUnitsThisPeriod) {}

    /** Returns the wallet snapshot for the team backing {@code teamKey}. */
    public WalletSnapshot getWalletSnapshot(String teamKey, boolean isLeader) {
        YearMonth ym = YearMonth.now();
        LocalDate periodStart = ym.atDay(1);
        LocalDate periodEnd = ym.atEndOfMonth();
        int billableUsed = mockUsageThisPeriod(teamKey);

        SubscriptionState sub =
                subscriptionStateByTeam
                        .computeIfAbsent(teamKey, k -> new AtomicReference<>())
                        .get();

        if (sub == null) {
            // Free tier
            return new WalletSnapshot(
                    "free",
                    isLeader ? "leader" : "member",
                    periodStart.toString(),
                    periodEnd.toString(),
                    billableUsed,
                    FREE_TIER_LIMIT_UNITS,
                    null,
                    false,
                    null,
                    billableUsed);
        }

        return new WalletSnapshot(
                "subscribed",
                isLeader ? "leader" : "member",
                periodStart.toString(),
                periodEnd.toString(),
                billableUsed,
                FREE_TIER_LIMIT_UNITS,
                sub.noCap() ? null : sub.capUsd(),
                sub.noCap(),
                sub.subscriptionId(),
                billableUsed);
    }

    /**
     * Creates a (mock) Stripe Checkout Session for the team to subscribe to Processor.
     *
     * <p>Returns a synthetic {@code client_secret} string with a sentinel prefix so the frontend's
     * Embedded Checkout integration can either:
     *
     * <ul>
     *   <li>detect the mock and render its "Stripe sandbox not configured" placeholder, OR
     *   <li>be fed the value to a real Stripe iframe (which will fail validation, but the failure
     *       path is also exercise-worthy).
     * </ul>
     *
     * <p>Real impl: call {@code com.stripe.model.checkout.Session.create(SessionCreateParams)} with
     * {@code mode=SUBSCRIPTION}, the team's Stripe price IDs from {@code
     * pricing_policy_stripe_price}, customer = the team's {@code
     * payg_team_extensions.stripe_customer_id} (eager-created), and pass the cap through {@code
     * subscription_data.metadata.cap_usd} so the webhook can pick it up.
     */
    public CheckoutSessionResult createCheckoutSession(
            String teamKey, int capUsd, boolean noCap, String returnUrl) {
        log.info(
                "Mock checkout session requested: team={} cap={} noCap={} returnUrl={}",
                teamKey,
                capUsd,
                noCap,
                returnUrl);
        String clientSecret = createMockClientSecret(teamKey);
        return new CheckoutSessionResult(clientSecret, true /* mock */);
    }

    /** Result of {@link #createCheckoutSession}. */
    public record CheckoutSessionResult(String clientSecret, boolean mock) {}

    /**
     * Marks the team as subscribed in the mock store. Called from the (currently absent) Stripe
     * webhook handler in the real flow — here it's exposed as a dev-only side-channel via {@link
     * PaygApiController#devMarkSubscribed} so the UI can be exercised end-to-end without Stripe.
     *
     * <p>Real impl: write to {@code payg_team_extensions.payg_subscription_id} from the {@code
     * customer.subscription.created} webhook handler (PR #300).
     */
    public void markSubscribed(String teamKey, int capUsd, boolean noCap) {
        AtomicReference<SubscriptionState> ref =
                subscriptionStateByTeam.computeIfAbsent(teamKey, k -> new AtomicReference<>());
        ref.set(
                new SubscriptionState(
                        "sub_mock_" + UUID.randomUUID(), capUsd, noCap, LocalDate.now()));
        log.info(
                "Mock subscription marked active for team={} cap={} noCap={}",
                teamKey,
                capUsd,
                noCap);
    }

    /**
     * Updates the cap for a subscribed team. No-op if the team is on the free tier.
     *
     * <p>Real impl: update {@code wallet_policy.cap_units} AND push the change to Stripe via {@code
     * SubscriptionItem.update(...)} with the new {@code billing_thresholds.amount_gte} so Stripe's
     * usage thresholds reflect the new ceiling.
     */
    public boolean updateCap(String teamKey, int capUsd, boolean noCap) {
        AtomicReference<SubscriptionState> ref = subscriptionStateByTeam.get(teamKey);
        if (ref == null) {
            return false;
        }
        // Atomic CAS via updateAndGet so a concurrent markSubscribed (or another updateCap on the
        // same team) can't lose the subscription id between read and write. Returns null when the
        // ref is empty (team has never subscribed) so the caller can 404.
        SubscriptionState updated =
                ref.updateAndGet(
                        current ->
                                current == null
                                        ? null
                                        : new SubscriptionState(
                                                current.subscriptionId(),
                                                capUsd,
                                                noCap,
                                                current.subscribedOn()));
        if (updated == null) {
            return false;
        }
        log.info("Cap updated for team={} → cap={} noCap={}", teamKey, capUsd, noCap);
        return true;
    }

    /**
     * Resolves an Authentication's principal to a stable team key. For now we just use the
     * principal's name (typically the supabase user id). When team-membership resolution lands,
     * swap this to {@code teamMembershipService.findTeamFor(userId).teamId().toString()}.
     */
    public String resolveTeamKey(java.security.Principal principal) {
        if (principal == null) {
            return "anonymous";
        }
        // TODO: resolve to a real team id once team-membership lookup is available.
        return "team:" + principal.getName();
    }

    /**
     * Mock usage curve: returns a deterministic but team-varying number so the UI shows realistic
     * data without a real metering pipeline. Range stays under {@link #FREE_TIER_LIMIT_UNITS} so
     * neither status pill (warned / degraded) is mistakenly triggered by a fresh tenant.
     */
    private int mockUsageThisPeriod(String teamKey) {
        // Hash-based curve gives stable per-team variety: 0–249 units.
        return Math.floorMod(teamKey.hashCode(), 250);
    }

    private String createMockClientSecret(String teamKey) {
        // Prefix lets the frontend detect mock mode and skip the real iframe wire-up.
        return "cs_mock_" + Integer.toHexString(teamKey.hashCode()) + "_" + UUID.randomUUID();
    }
}
