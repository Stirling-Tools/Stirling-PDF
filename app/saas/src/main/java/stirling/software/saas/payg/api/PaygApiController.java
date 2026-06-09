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
 * <p>Stripe-touching code (create Checkout Session, update subscription_item) lives in Supabase
 * edge functions, <b>not</b> here:
 *
 * <ul>
 *   <li>{@code create-payg-team-subscription} (SaaS PR #300) — the FE calls this directly via
 *       {@code supabase.functions.invoke()}; same pattern {@code usePlans} uses for {@code
 *       stripe-price-lookup}.
 *   <li>Cap updates — when the {@code update-payg-cap} edge function lands, the {@link #updateCap}
 *       endpoint here will be removed too. Until then it's a Java stub so the FE wiring is
 *       testable.
 *   <li>{@code payg-subscription-webhook} (PR #300) — Stripe's {@code
 *       customer.subscription.created} fires here, writes to {@code
 *       payg_team_extensions.payg_subscription_id}. The Java side just refetches the wallet to pick
 *       up the change.
 * </ul>
 *
 * <p>Java keeps the wallet read because (a) it composes data from team_memberships +
 * payg_team_extensions + payg_meter_event_log, all of which Spring Data already handles, and (b)
 * the Spring Security context is already attached. Adding a Stripe SDK to the Java backend would
 * mean two integrations to maintain.
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
    // NOTE: This endpoint also wants to live in a Supabase edge function
    // ({@code update-payg-cap}, not yet on PR #300) because updating the cap
    // requires a {@code subscription_item.update} call to Stripe to adjust
    // the {@code billing_thresholds.amount_gte} threshold. Until that edge
    // function exists, Java holds the stub so the FE wiring is testable; the
    // mock service just records the new cap in-memory.

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
