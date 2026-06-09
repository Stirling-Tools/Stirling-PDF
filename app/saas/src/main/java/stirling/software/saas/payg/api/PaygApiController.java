package stirling.software.saas.payg.api;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.api.PaygApiService.WalletSnapshot;

/**
 * Public REST endpoints for the PAYG Plan page UI.
 *
 * <p>All endpoints are gated on the {@code saas} profile and require an authenticated user; the
 * Spring Security chain in the saas module already enforces that for {@code /api/v1/payg/**}.
 *
 * <h2>Scope — Java vs Supabase edge function</h2>
 *
 * <p>The split is about <em>who owns the data</em>, not whether it touches Stripe. Code that
 * mutates our own Postgres (under our auth + RLS) lives here; code that mutates Stripe lives in
 * edge functions.
 *
 * <p>This controller owns:
 *
 * <ul>
 *   <li>{@link #getWallet} — pure read from Postgres ({@code payg_team_extensions} + {@code
 *       payg_meter_event_log} + {@code team_memberships}).
 *   <li>{@link #updateCap} — pure write to our own {@code wallet_policy.cap_units}. The cap is an
 *       <b>application-layer enforcement rule</b>, not a Stripe concept: Stripe has no native hard
 *       cap (its {@code billing_thresholds.amount_gte} is just an early-invoice trigger, not a
 *       cut-off). We enforce by gating the {@code meter-payg-units} push on a current-period-spend
 *       check; Stripe only ever sees events we let through. Cap updates are therefore a single SQL
 *       UPDATE — no edge function, no Stripe round-trip.
 *   <li>{@link #devMarkSubscribed} — dev-only side-channel for the mock loop. Disappears once the
 *       real {@code payg-subscription-webhook} (SaaS PR #300) is deployed; that webhook is what
 *       writes {@code payg_team_extensions.payg_subscription_id} from {@code
 *       customer.subscription.created} in the real flow.
 * </ul>
 *
 * <p>Stripe-touching code lives in edge functions (SaaS PR #300):
 *
 * <ul>
 *   <li>{@code create-payg-team-subscription} — creates Checkout Sessions. FE invokes directly via
 *       {@code supabase.functions.invoke()}, same pattern {@code usePlans} uses for {@code
 *       stripe-price-lookup}.
 *   <li>{@code meter-payg-units} — pushes usage events to Stripe. Called from the metered job
 *       pipeline once the cap check (above) has cleared.
 *   <li>{@code payg-subscription-webhook} — receives Stripe lifecycle events (subscription created
 *       / updated / cancelled) and writes them to {@code payg_team_extensions}.
 * </ul>
 *
 * <p>So no Stripe SDK ever lands in this Java module — usage gating is our own rule, not Stripe's.
 *
 * <p><b>Backed by a mock service today.</b> See {@link PaygApiService} for the swap-out plan.
 */
@RestController
@Profile("saas")
@RequestMapping("/api/v1/payg")
@Tag(name = "PAYG", description = "Pay-as-you-go subscription, wallet, and cap management")
@RequiredArgsConstructor
@Slf4j
public class PaygApiController {

    private final PaygApiService paygApi;

    /**
     * Whether the dev-only side-channel subscribe endpoint is exposed. Defaults to OFF so we don't
     * ship a "any authenticated user can flip their team to subscribed" endpoint by accident; flip
     * to {@code true} via {@code payg.dev-endpoints.enabled=true} in {@code application-saas.yml}
     * for the dev loop, and ensure it's not set in any staging/prod overlay. Even when enabled, the
     * endpoint also requires {@code ROLE_ADMIN}.
     */
    @Value("${payg.dev-endpoints.enabled:false}")
    private boolean devEndpointsEnabled;

    // ─── Wallet snapshot ────────────────────────────────────────────────

    @GetMapping("/wallet")
    @Operation(
            summary = "Get wallet snapshot",
            description =
                    "Returns current subscription state, free-tier usage, cap, and viewer role."
                            + " The frontend Plan page branches its rendered view on this payload.")
    public ResponseEntity<WalletSnapshot> getWallet(Authentication authentication) {
        String teamKey = paygApi.resolveTeamKey(authentication);
        boolean isLeader = isAdmin(authentication);
        return ResponseEntity.ok(paygApi.getWalletSnapshot(teamKey, isLeader));
    }

    // ─── Cap update ─────────────────────────────────────────────────────
    //
    // The cap is an application-layer rule (gate the meter push on
    // current_period_spend ≤ cap). No Stripe touch needed — Stripe doesn't
    // have a native hard cap, and the meter only sees events we explicitly
    // push. Real impl: UPDATE wallet_policy SET cap_units = $1 WHERE
    // team_id = $2. The mock service in this branch just records the new
    // cap in its in-memory store; the swap-out is a single repository write.

    /** Request body for {@link #updateCap}. */
    public record UpdateCapRequest(@Min(0) @Max(10_000) int capUsd, boolean noCap) {}

    @PatchMapping("/cap")
    @Operation(
            summary = "Update the team's monthly spend cap",
            description =
                    "Updates the monthly spend ceiling for the team. Requires an active"
                            + " subscription. Returns 404 if the team is on the free tier.")
    public ResponseEntity<Map<String, Object>> updateCap(
            Authentication authentication, @Valid @RequestBody UpdateCapRequest req) {
        String teamKey = paygApi.resolveTeamKey(authentication);
        boolean updated = paygApi.updateCap(teamKey, req.capUsd(), req.noCap());
        if (!updated) {
            return ResponseEntity.status(404)
                    .body(Map.of("error", "Team is not subscribed — cap cannot be set"));
        }
        return ResponseEntity.ok(
                Map.of("success", true, "capUsd", req.capUsd(), "noCap", req.noCap()));
    }

    // ─── DEV-ONLY: side-channel subscribe ───────────────────────────────

    /**
     * Marks the current team as subscribed without going through Stripe. Used by the frontend
     * UpgradeModal's "complete" action when the backend's mock checkout is in effect — exercises
     * the post-subscribe UI path end-to-end.
     *
     * <p>When the real Stripe webhook handler lands (PR #300 ships {@code payg-subscription}
     * webhook), this endpoint should be deleted. Until then it's a faster feedback loop than
     * setting up Stripe test mode for every UI change.
     */
    @PostMapping("/dev/mark-subscribed")
    @Hidden
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(
            summary = "DEV-ONLY: simulate Stripe webhook success",
            description =
                    "Marks the team as subscribed without going through Stripe. Requires both"
                            + " ROLE_ADMIN and payg.dev-endpoints.enabled=true; defaults to disabled."
                            + " Delete once the real customer.subscription.created webhook handler is"
                            + " wired up.")
    public ResponseEntity<Map<String, Object>> devMarkSubscribed(
            Authentication authentication, @Valid @RequestBody UpdateCapRequest req) {
        if (!devEndpointsEnabled) {
            // Mirror the "not found" surface so probes don't reveal that the endpoint exists.
            return ResponseEntity.status(404).body(Map.of("error", "Not found"));
        }
        String teamKey = paygApi.resolveTeamKey(authentication);
        paygApi.markSubscribed(teamKey, req.capUsd(), req.noCap());
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    /**
     * Best-effort "is this user the team owner" check. Mirrors the proxy {@code
     * saasConfigNavSections} used before the dedicated team-role lookup landed. Real impl: query
     * {@code team_memberships.role} for the user.
     */
    private boolean isAdmin(Authentication authentication) {
        if (authentication == null) return false;
        return authentication.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }
}
