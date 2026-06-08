package stirling.software.saas.payg.api;

import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.api.PaygApiService.CheckoutSessionResult;
import stirling.software.saas.payg.api.PaygApiService.WalletSnapshot;

/**
 * Public REST endpoints for the PAYG Plan page UI.
 *
 * <p>All endpoints are gated on the {@code saas} profile and require an authenticated user; the
 * Spring Security chain in the saas module already enforces that for {@code /api/v1/payg/**}.
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

    // ─── Checkout session creation ──────────────────────────────────────

    /**
     * Request body for {@link #createCheckoutSession}. {@code capUsd} is ignored when {@code noCap
     * = true}, but always required to keep the payload simple.
     */
    public record CheckoutSessionRequest(
            @Min(0) @Max(10_000) int capUsd, boolean noCap, String returnUrl) {}

    /** Response body for {@link #createCheckoutSession}. */
    public record CheckoutSessionResponse(String clientSecret, boolean mock) {}

    @PostMapping("/checkout")
    @Operation(
            summary = "Create a Stripe Checkout Session",
            description =
                    "Creates a Stripe Embedded Checkout session for subscribing to Processor."
                            + " The returned client_secret is consumed by the frontend's"
                            + " <EmbeddedCheckoutProvider> in step 2 of the Upgrade modal."
                            + " Today returns a mock secret prefixed `cs_mock_` so the FE can detect"
                            + " unconfigured environments and render a placeholder.")
    public ResponseEntity<CheckoutSessionResponse> createCheckoutSession(
            Authentication authentication, @Valid @RequestBody CheckoutSessionRequest req) {
        String teamKey = paygApi.resolveTeamKey(authentication);
        CheckoutSessionResult res =
                paygApi.createCheckoutSession(teamKey, req.capUsd(), req.noCap(), req.returnUrl());
        return ResponseEntity.ok(new CheckoutSessionResponse(res.clientSecret(), res.mock()));
    }

    // ─── Cap update ─────────────────────────────────────────────────────

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
    @Operation(
            summary = "DEV-ONLY: simulate Stripe webhook success",
            description =
                    "Marks the team as subscribed without going through Stripe. Delete once the"
                            + " real customer.subscription.created webhook handler is wired up.")
    public ResponseEntity<Map<String, Object>> devMarkSubscribed(
            Authentication authentication, @Valid @RequestBody UpdateCapRequest req) {
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
