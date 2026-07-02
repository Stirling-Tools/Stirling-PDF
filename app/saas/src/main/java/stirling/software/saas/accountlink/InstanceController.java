package stirling.software.saas.accountlink;

import java.time.LocalDateTime;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.entitlement.EntitlementService;
import stirling.software.saas.payg.entitlement.EntitlementSnapshot;
import stirling.software.saas.payg.instance.InstanceUsageIngestService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;

/**
 * Instance-facing surface (combined-billing "Mode A"), authenticated by the <b>device
 * credential</b> — not a user JWT. Separate path prefix ({@code /api/v1/instance/**}) so the device
 * credential is scoped here and nowhere else.
 *
 * <p>{@code GET /whoami} is the MVP round-trip proof: a registered instance presenting a valid
 * device credential gets back its resolved {@code instanceId} + {@code teamId}. {@code GET
 * /entitlement} is the read the local gate consumes — the same team-scoped snapshot the FE wallet
 * sees, trimmed to the fields the gate needs (subscription, free pool, period spend/cap, state),
 * and built on the same device-credential auth.
 *
 * <p>Gated behind {@code stirling.billing.account-link.enabled}: off → beans absent → 404.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/instance")
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceController {

    private final EntitlementService entitlementService;
    private final TeamBillingService billingService;
    private final AccountLinkService accountLinkService;
    private final PricingPolicyService pricingPolicyService;
    private final InstanceUsageIngestService usageIngestService;
    private final LinkedInstanceRepository linkedInstanceRepository;

    public InstanceController(
            EntitlementService entitlementService,
            TeamBillingService billingService,
            AccountLinkService accountLinkService,
            PricingPolicyService pricingPolicyService,
            InstanceUsageIngestService usageIngestService,
            LinkedInstanceRepository linkedInstanceRepository) {
        this.entitlementService = entitlementService;
        this.billingService = billingService;
        this.accountLinkService = accountLinkService;
        this.pricingPolicyService = pricingPolicyService;
        this.usageIngestService = usageIngestService;
        this.linkedInstanceRepository = linkedInstanceRepository;
    }

    public record WhoAmIResponse(Long instanceId, Long teamId) {}

    /**
     * Minimal entitlement view the local gate enforces against. {@code periodCapUnits} null =
     * uncapped. {@code state} is the coarse OK / OVER_LIMIT vocabulary the instance gate parses
     * (see {@link #coarseState}), not the SaaS feature-state enum.
     */
    public record EntitlementResponse(
            boolean subscribed,
            long freeRemainingUnits,
            long periodSpendUnits,
            Long periodCapUnits,
            String state,
            // Metering inputs the instance needs to cost + bucket its own usage (Phase 2). The
            // instance computes units locally with this policy and resets its per-period cumulative
            // counters on the [periodStart, periodEnd) boundary.
            UnitCalcPolicy unitCalcPolicy,
            LocalDateTime periodStart,
            LocalDateTime periodEnd) {}

    @GetMapping("/whoami")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<WhoAmIResponse> whoami(Authentication auth) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            // Belt-and-braces: hasRole already guarantees this, but never leak a non-instance
            // principal.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(new WhoAmIResponse(token.getInstanceId(), token.getTeamId()));
    }

    /**
     * Revokes this instance's own credential — a credential can mark itself revoked the same way a
     * session logs itself out. Called by the proprietary backend on local unlink so the SaaS row
     * gets {@code revoked_at} set; idempotent (already-revoked → still 204).
     */
    @PostMapping("/revoke-self")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<Void> revokeSelf(Authentication auth) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        accountLinkService.revoke(token.getTeamId(), token.getInstanceId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/entitlement")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    @Transactional(readOnly = true)
    public ResponseEntity<EntitlementResponse> entitlement(Authentication auth) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        // Drop any cached snapshot before building. The instance polls this only every few minutes
        // and gates real-time billable work on the answer, so it must reflect subscription / cap
        // changes (e.g. a just-completed checkout) immediately, not up to a cache-TTL later. The
        // subscription flip is written by a Postgres function (payg_link_subscription) with no Java
        // event to invalidate on, so this low-frequency instance-facing read is where we guarantee
        // freshness — the SaaS caches still shield the high-frequency cloud guard path.
        entitlementService.invalidate(token.getTeamId());
        return ResponseEntity.ok(buildEntitlement(token.getTeamId()));
    }

    /** Body for {@code POST /sync}: the instance's cumulative units per category this period. */
    public record UsageSyncRequest(
            long syncSeq, LocalDateTime periodStart, CategoryUnits cumulativeUnits) {
        public record CategoryUnits(long api, long ai, long automation) {}
    }

    /**
     * Daily usage sync: the instance reports its cumulative per-category unit totals for the
     * period; SaaS bills the delta since the last sync (reusing the standard charge path) and
     * returns the fresh entitlement — so one round-trip both reports usage and refreshes the gate
     * state.
     */
    @PostMapping("/sync")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    @Transactional
    public ResponseEntity<EntitlementResponse> sync(
            Authentication auth, @RequestBody UsageSyncRequest req) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (req == null || req.periodStart() == null || req.cumulativeUnits() == null) {
            return ResponseEntity.badRequest().build();
        }
        Long teamId = token.getTeamId();
        // periodStart is the (team, period, category) partition key the dedup/regression guards key
        // on, so a fabricated value could reset those guards. Bound it to a plausible window around
        // the authoritative snapshot period — the current period or the immediately-prior one
        // (rollover lag), never the future — rejecting anything else.
        EntitlementSnapshot snap = entitlementService.getSnapshot(teamId);
        LocalDateTime reported = req.periodStart();
        if (!reported.isBefore(snap.periodEnd())
                || reported.isBefore(snap.periodStart().minusMonths(1))) {
            log.warn(
                    "Instance sync for team {} reported implausible periodStart {} (authoritative"
                            + " {}..{}); rejecting.",
                    teamId,
                    reported,
                    snap.periodStart(),
                    snap.periodEnd());
            return ResponseEntity.badRequest().build();
        }
        // Attribute the charge to the admin who linked the instance (the device credential carries
        // no user). Null is tolerated by the ingest service (it skips + retries next sync).
        Long actorUserId =
                linkedInstanceRepository
                        .findById(token.getInstanceId())
                        .map(LinkedInstance::getCreatedByUserId)
                        .orElse(null);
        UsageSyncRequest.CategoryUnits c = req.cumulativeUnits();
        usageIngestService.ingest(
                teamId,
                actorUserId,
                req.syncSeq(),
                req.periodStart(),
                Map.of(
                        BillingCategory.API, c.api(),
                        BillingCategory.AI, c.ai(),
                        BillingCategory.AUTOMATION, c.automation()));
        // A sync lands the whole delta at once — the admin is typically watching the usage page
        // right after — so drop the 30s snapshot/billing cache now instead of letting the daily
        // charge sit invisible until the TTL lapses. Refreshes both the period spend and the
        // free-grant balance the ingest just moved. The buildEntitlement below (and the portal's
        // next wallet read) then reflect the charge immediately.
        entitlementService.invalidate(teamId);
        return ResponseEntity.ok(buildEntitlement(teamId));
    }

    /** The entitlement view shared by {@code GET /entitlement} and the {@code /sync} response. */
    private EntitlementResponse buildEntitlement(Long teamId) {
        // Same composition the FE wallet uses: billing facts (subscription, free pool) from
        // TeamBillingService, period spend/cap + state from the entitlement snapshot, plus the
        // unit-calc policy + period the instance needs to meter locally.
        TeamBillingContext billing = billingService.forTeam(teamId);
        EntitlementSnapshot snap = entitlementService.getSnapshot(teamId);
        PricingPolicy policy = pricingPolicyService.getEffectivePolicy(teamId);
        return new EntitlementResponse(
                billing.subscribed(),
                billing.freeRemainingUnits(),
                snap.periodSpendUnits(),
                snap.periodCapUnits(),
                coarseState(snap.state()),
                new UnitCalcPolicy(
                        policy.getDocPagesPerUnit(),
                        policy.getDocBytesPerUnit(),
                        policy.getMinChargeUnits(),
                        policy.getFileUnitCap()),
                snap.periodStart(),
                snap.periodEnd());
    }

    /**
     * Collapses the SaaS feature-state machine into the OK / OVER_LIMIT vocabulary the instance
     * gate parses. DEGRADED means automation + AI are gated off — which, for a gate that governs
     * only billable work (manual tools are free-pathed before it), is exactly OVER_LIMIT; FULL and
     * WARNED are OK.
     */
    private static String coarseState(EntitlementState state) {
        return state == EntitlementState.DEGRADED ? "OVER_LIMIT" : "OK";
    }
}
