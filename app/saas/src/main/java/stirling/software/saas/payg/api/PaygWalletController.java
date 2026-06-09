package stirling.software.saas.payg.api;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.payg.api.WalletSnapshotResponse.CategoryBreakdown;
import stirling.software.saas.payg.api.WalletSnapshotResponse.MemberRow;
import stirling.software.saas.payg.entitlement.EntitlementService;
import stirling.software.saas.payg.entitlement.EntitlementSnapshot;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletCategorySummaryDao;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletPolicy;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Read + cap-mutation surface backing the FE PAYG Plan page.
 *
 * <p>{@code GET /api/v1/payg/wallet} is the single fetch the {@code useWallet} hook calls. Returns
 * a fully-populated {@link WalletSnapshotResponse} — derived from {@link EntitlementService} (for
 * spend / cap / period), {@link PaygTeamExtensions} (for subscription state), and the {@code
 * wallet_category_summary} view (for the per-category breakdown widget). Leader callers also get a
 * roster of team members + their sub-caps; member callers see an empty roster.
 *
 * <p>{@code PATCH /api/v1/payg/cap} updates {@code wallet_policy.cap_units} (no Stripe call — the
 * cap is enforced application-side via the entitlement guard) and invalidates the team's snapshot
 * cache so the next read reflects the change immediately. Only leaders may call this; the team is
 * derived from the caller, so we authorise inside the method rather than via {@code @PreAuthorize}
 * — the team id never appears on the path or query string.
 *
 * <p><b>Known dependency on PR #6532:</b> {@code stripeSubscriptionId} is sourced from {@code
 * payg_team_extensions.payg_subscription_id} once that column ships; on this branch the column
 * doesn't exist yet, so the response always returns {@code null} for that field. {@link
 * #STATUS_SUBSCRIBED} is determined by the presence of {@code stripeCustomerId} as a stand-in until
 * #6532 lands; once it does, swap to checking {@code paygSubscriptionId} instead.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/payg")
@Profile("saas")
public class PaygWalletController {

    static final String STATUS_FREE = "free";
    static final String STATUS_SUBSCRIBED = "subscribed";
    static final String ROLE_LEADER = "leader";
    static final String ROLE_MEMBER = "member";

    /**
     * Free-tier ceiling shown to un-subscribed teams. Mirrors {@link
     * EntitlementService#DEFAULT_FREE_TIER_UNITS} until {@code
     * pricing_policy.free_tier_units_per_cycle} lands and the value can be read live.
     */
    private static final int FREE_TIER_LIMIT_UNITS_FALLBACK = 500;

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private final EntitlementService entitlementService;
    private final TeamMembershipRepository memberRepo;
    private final PaygTeamExtensionsRepository extRepo;
    private final WalletPolicyRepository policyRepo;
    private final WalletLedgerRepository ledgerRepo;
    private final WalletCategorySummaryDao categorySummaryDao;
    private final UserRepository userRepository;
    private final RestTemplate saasRestTemplate;
    private final String portalEndpoint;
    private final String portalServiceRoleToken;

    public PaygWalletController(
            EntitlementService entitlementService,
            TeamMembershipRepository memberRepo,
            PaygTeamExtensionsRepository extRepo,
            WalletPolicyRepository policyRepo,
            WalletLedgerRepository ledgerRepo,
            WalletCategorySummaryDao categorySummaryDao,
            UserRepository userRepository,
            RestTemplate saasRestTemplate,
            @Value("${payg.portal.endpoint:}") String portalEndpoint,
            @Value("${payg.portal.service-role-token:}") String portalServiceRoleToken) {
        this.entitlementService = Objects.requireNonNull(entitlementService, "entitlementService");
        this.memberRepo = Objects.requireNonNull(memberRepo, "memberRepo");
        this.extRepo = Objects.requireNonNull(extRepo, "extRepo");
        this.policyRepo = Objects.requireNonNull(policyRepo, "policyRepo");
        this.ledgerRepo = Objects.requireNonNull(ledgerRepo, "ledgerRepo");
        this.categorySummaryDao = Objects.requireNonNull(categorySummaryDao, "categorySummaryDao");
        this.userRepository = Objects.requireNonNull(userRepository, "userRepository");
        this.saasRestTemplate = Objects.requireNonNull(saasRestTemplate, "saasRestTemplate");
        this.portalEndpoint = portalEndpoint == null ? "" : portalEndpoint;
        this.portalServiceRoleToken = portalServiceRoleToken == null ? "" : portalServiceRoleToken;
    }

    // ---------------------------------------------------------------------------------------
    // GET /wallet — the single FE fetch
    // ---------------------------------------------------------------------------------------

    @GetMapping("/wallet")
    @PreAuthorize("isAuthenticated()")
    @Transactional(readOnly = true)
    public ResponseEntity<WalletSnapshotResponse> getWallet(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            // SecurityException maps to 401 per the existing controller convention.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<TeamMembership> primary = primaryMembership(user.getId());
        if (primary.isEmpty()) {
            // Authenticated user without a team — shouldn't happen post-migration, but we don't
            // want to 500. Return a free-tier-shaped empty snapshot so the FE renders the gated UI
            // rather than blowing up on a null body.
            return ResponseEntity.ok(emptySnapshot());
        }

        TeamMembership membership = primary.get();
        Long teamId = membership.getTeam().getId();
        boolean isLeader = membership.getRole() == TeamRole.LEADER;

        Optional<PaygTeamExtensions> extOpt = extRepo.findById(teamId);
        Optional<WalletPolicy> policyOpt = policyRepo.findByTeamId(teamId);

        EntitlementSnapshot snap = entitlementService.getSnapshot(teamId);

        boolean subscribed = isSubscribed(extOpt);
        String status = subscribed ? STATUS_SUBSCRIBED : STATUS_FREE;

        Long capUnits = policyOpt.map(WalletPolicy::getCapUnits).orElse(null);
        boolean noCap = subscribed && capUnits == null;
        Integer capUsd =
                (subscribed && capUnits != null) ? CapMoneyUnits.unitsToUsd(capUnits) : null;

        int spend = clampToInt(snap.periodSpendUnits());
        int limit = resolveBillableLimit(subscribed, snap);

        LocalDate periodStartDate = snap.periodStart().toLocalDate();
        Map<BillingCategory, Long> byCategory =
                categorySummaryDao.sumByCategory(teamId, periodStartDate);
        CategoryBreakdown breakdown =
                new CategoryBreakdown(
                        clampToInt(byCategory.getOrDefault(BillingCategory.API, 0L)),
                        clampToInt(byCategory.getOrDefault(BillingCategory.AI, 0L)),
                        clampToInt(byCategory.getOrDefault(BillingCategory.AUTOMATION, 0L)));

        List<MemberRow> members = isLeader ? buildMemberRows(teamId) : List.of();

        WalletSnapshotResponse body =
                new WalletSnapshotResponse(
                        status,
                        isLeader ? ROLE_LEADER : ROLE_MEMBER,
                        ISO_DATE.format(periodStartDate),
                        ISO_DATE.format(snap.periodEnd().toLocalDate()),
                        spend,
                        limit,
                        capUsd,
                        noCap,
                        // Subscription id sourced from PR #6532's payg_subscription_id column;
                        // null on this branch until that ships.
                        null,
                        spend,
                        breakdown,
                        members,
                        Collections.emptyList());
        return ResponseEntity.ok(body);
    }

    // ---------------------------------------------------------------------------------------
    // PATCH /cap — leader-only, cap is application-layer, no Stripe call
    // ---------------------------------------------------------------------------------------

    @PatchMapping("/cap")
    @PreAuthorize("isAuthenticated()")
    @Transactional
    public ResponseEntity<Void> updateCap(
            @Valid @RequestBody UpdateCapRequest req, Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Optional<TeamMembership> primary = primaryMembership(user.getId());
        if (primary.isEmpty()) {
            // No team → can't have a wallet to cap.
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        TeamMembership membership = primary.get();
        if (membership.getRole() != TeamRole.LEADER) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Long teamId = membership.getTeam().getId();

        WalletPolicy policy =
                policyRepo
                        .findByTeamId(teamId)
                        .orElseGet(
                                () -> {
                                    WalletPolicy created = new WalletPolicy();
                                    created.setTeamId(teamId);
                                    return created;
                                });

        if (req.noCap()) {
            policy.setCapUnits(null);
            policy.setCapSourceMoney(null);
        } else {
            policy.setCapUnits(CapMoneyUnits.usdToUnits(req.capUsd()));
            policy.setCapSourceMoney(CapMoneyUnits.usdToCents(req.capUsd()));
        }
        policyRepo.save(policy);
        entitlementService.invalidate(teamId);
        return ResponseEntity.noContent().build();
    }

    /** Request body for {@link #updateCap}. */
    public record UpdateCapRequest(@Min(0) int capUsd, boolean noCap) {}

    // ---------------------------------------------------------------------------------------
    // PATCH /sub-caps/{userId} — leader sets a per-member sub-cap inside the team wallet
    // ---------------------------------------------------------------------------------------

    /**
     * Updates {@code team_memberships.cap_units} for the given member of the caller's team.
     *
     * <p>Authorisation:
     *
     * <ul>
     *   <li>caller must be authenticated (else 401);
     *   <li>caller must be a {@code LEADER} of a team (else 403);
     *   <li>the target {@code userId} must be a member of the caller's team (else 404).
     * </ul>
     *
     * <p>Clamp rule (per design): if the requested sub-cap exceeds the team-wide {@code
     * wallet_policy.cap_units}, the value is silently clamped to the team cap and the response
     * carries {@code clamped=true}. We do this at save time rather than rejecting so the leader
     * doesn't see a confusing 4xx when they typed a number bigger than the team's own cap — the
     * intent ("don't let this member spend more than X") is honoured by setting the effective
     * maximum, which is the team cap. If the team has no cap (subscribed, no-cap mode), no clamping
     * applies. A {@code null} {@code capUnits} clears the sub-cap entirely (member is bounded only
     * by the team cap).
     */
    @PatchMapping("/sub-caps/{userId}")
    @PreAuthorize("isAuthenticated()")
    @Transactional
    public ResponseEntity<Map<String, Object>> updateSubCap(
            @PathVariable Long userId,
            @Valid @RequestBody UpdateSubCapRequest req,
            Authentication auth) {
        User caller;
        try {
            caller = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<TeamMembership> primary = primaryMembership(caller.getId());
        if (primary.isEmpty() || primary.get().getRole() != TeamRole.LEADER) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Long teamId = primary.get().getTeam().getId();

        // Target must be a member of the same team. Anything else (different team, unknown user)
        // is 404 — leaks no information about other teams.
        Optional<TeamMembership> targetOpt = memberRepo.findByTeamIdAndUserId(teamId, userId);
        if (targetOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        TeamMembership target = targetOpt.get();

        // Team cap: null means unlimited (subscribed no-cap). Anything else is a Long ceiling.
        Long teamCap = policyRepo.findByTeamId(teamId).map(WalletPolicy::getCapUnits).orElse(null);

        Long effective;
        boolean clamped = false;
        if (req.capUnits() == null) {
            effective = null;
        } else {
            long requested = req.capUnits().longValue();
            if (teamCap != null && requested > teamCap) {
                effective = teamCap;
                clamped = true;
            } else {
                effective = requested;
            }
        }

        target.setCapUnits(effective);
        memberRepo.save(target);
        entitlementService.invalidate(teamId);

        Map<String, Object> body = new HashMap<>();
        body.put("success", true);
        // Effective value after clamp; null means "no sub-cap" (member bounded by team cap).
        body.put("capUnits", effective);
        body.put("clamped", clamped);
        return ResponseEntity.ok(body);
    }

    /**
     * Request body for {@link #updateSubCap}.
     *
     * @param capUnits per-member sub-cap in doc units; {@code null} clears the sub-cap so the
     *     member is bounded only by the team cap.
     */
    public record UpdateSubCapRequest(@Min(0) Integer capUnits) {}

    // ---------------------------------------------------------------------------------------
    // POST /portal-session — proxy to Supabase create-customer-portal-session edge function
    // ---------------------------------------------------------------------------------------

    /**
     * Mints a Stripe-hosted billing-portal session URL for the caller's team and returns it for the
     * FE to redirect to. We proxy through Supabase's {@code create-customer-portal-session} edge
     * function rather than calling Stripe directly so the Stripe secret never leaves Supabase and
     * portal config stays version-controlled alongside the rest of the billing pipeline.
     *
     * <p>Authorisation: any authenticated team member can open the portal. The portal itself shows
     * billing for the whole team (Stripe customer is per-team), so this is by design — we don't
     * gate to leaders the way {@code PATCH /cap} does. If product later wants leader-only access
     * we'd add a {@code TeamRole.LEADER} check here.
     *
     * <p>We pre-check that the team actually has a Stripe customer before calling the edge fn so a
     * free-tier team gets a clean 404 + {@code TEAM_NOT_SUBSCRIBED} instead of a generic 502 from a
     * downstream error. {@link #isSubscribed(Optional)} stays the source of truth for "subscribed"
     * across both this endpoint and {@code GET /wallet}.
     *
     * <p>Status map:
     *
     * <ul>
     *   <li>200 + {@code {url}} — happy path.
     *   <li>401 — anonymous / missing principal.
     *   <li>403 — authenticated but no team (caller can't have a portal session without one).
     *   <li>404 + {@code {error: "TEAM_NOT_SUBSCRIBED"}} — team has no Stripe customer yet.
     *   <li>502 + {@code {error: "PORTAL_UNAVAILABLE"}} — edge fn returned non-2xx or {@code
     *       success=false}, or the call itself threw.
     *   <li>503 + {@code {error: "PORTAL_NOT_CONFIGURED"}} — {@code payg.portal.endpoint} is blank
     *       (local dev / unit tests).
     * </ul>
     */
    @PostMapping("/portal-session")
    @PreAuthorize("isAuthenticated()")
    @Transactional(readOnly = true)
    public ResponseEntity<Map<String, Object>> createPortalSession(
            @Valid @RequestBody PortalSessionRequest req, Authentication auth) {
        if (portalEndpoint.isBlank()) {
            // Local dev / unit tests without Supabase configured — return a clean 503 instead of
            // letting RestTemplate explode on a blank URL.
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "PORTAL_NOT_CONFIGURED"));
        }

        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<TeamMembership> primary = primaryMembership(user.getId());
        if (primary.isEmpty()) {
            // Authenticated but no team → no Stripe customer can exist for them. 403 mirrors the
            // cap endpoints' "no team to act on" response.
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Long teamId = primary.get().getTeam().getId();

        Optional<PaygTeamExtensions> extOpt = extRepo.findById(teamId);
        if (!isSubscribed(extOpt)) {
            // Free-tier team — no Stripe customer means no portal to open. Return a 404 with the
            // documented error code so the FE can show "Subscribe first" rather than a generic
            // error toast.
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "TEAM_NOT_SUBSCRIBED"));
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            if (!portalServiceRoleToken.isBlank()) {
                headers.setBearerAuth(portalServiceRoleToken);
            }
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> body = new HashMap<>();
            body.put("team_id", teamId.toString());
            if (req != null && req.returnUrl() != null && !req.returnUrl().isBlank()) {
                body.put("return_url", req.returnUrl());
            }

            ResponseEntity<Map> response =
                    saasRestTemplate.exchange(
                            portalEndpoint,
                            HttpMethod.POST,
                            new HttpEntity<>(body, headers),
                            Map.class);

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.warn(
                        "Portal session edge fn returned {} for team {}",
                        response.getStatusCode(),
                        teamId);
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                        .body(Map.of("error", "PORTAL_UNAVAILABLE"));
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> respBody = (Map<String, Object>) response.getBody();
            Object successVal = respBody.get("success");
            Object urlVal = respBody.get("url");
            boolean success = Boolean.TRUE.equals(successVal);
            if (!success || !(urlVal instanceof String) || ((String) urlVal).isBlank()) {
                log.warn(
                        "Portal session edge fn payload invalid for team {}: success={} urlPresent={}",
                        teamId,
                        successVal,
                        urlVal != null);
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                        .body(Map.of("error", "PORTAL_UNAVAILABLE"));
            }

            return ResponseEntity.ok(Map.of("url", urlVal));
        } catch (Exception e) {
            // Edge fn unreachable, timeout, malformed response, etc. Anything that propagates up
            // becomes a 502 — the caller hits "Manage billing" again or contacts support; we
            // never 500 on a downstream wobble.
            log.warn("Portal session edge fn call failed for team {}: {}", teamId, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "PORTAL_UNAVAILABLE"));
        }
    }

    /**
     * Request body for {@link #createPortalSession}. {@code returnUrl} is optional — if blank /
     * null the edge function falls back to its configured default. We don't validate the URL shape
     * here because the edge fn already does and Stripe will reject a malformed value, so double
     * validation only diverges over time.
     */
    public record PortalSessionRequest(String returnUrl) {}

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private Optional<TeamMembership> primaryMembership(Long userId) {
        List<TeamMembership> rows = memberRepo.findPrimaryMembership(userId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /**
     * Until {@code payg_subscription_id} (PR #6532) lands we treat the presence of {@code
     * stripe_customer_id} as a stand-in for "is subscribed." Once that PR merges this check
     * collapses to {@code ext.getPaygSubscriptionId() != null}.
     */
    private static boolean isSubscribed(Optional<PaygTeamExtensions> extOpt) {
        return extOpt.map(PaygTeamExtensions::getStripeCustomerId)
                .filter(s -> !s.isBlank())
                .isPresent();
    }

    private List<MemberRow> buildMemberRows(Long teamId) {
        List<TeamMembership> all = memberRepo.findByTeamId(teamId);
        if (all.isEmpty()) {
            return List.of();
        }
        LocalDateTime[] window = currentMonthWindow();
        List<MemberRow> out = new ArrayList<>(all.size());
        for (TeamMembership tm : all) {
            User u = tm.getUser();
            if (u == null) {
                continue;
            }
            // We could batch these; team sizes are small (FE design assumes ≤ ~20 members per
            // team on the Plan page) so a per-member sum is fine. If teams grow we'd switch to
            // a single GROUP BY actor_user_id query.
            long spend = 0L; // sumPeriodAmountForMember stores signed debits (negative); negate.
            try {
                spend = -memberSpend(teamId, u.getId(), window[0], window[1]);
            } catch (RuntimeException e) {
                log.warn(
                        "buildMemberRows: per-member spend lookup failed for user {}",
                        u.getId(),
                        e);
            }
            String displayName =
                    Optional.ofNullable(u.getUsername())
                            .orElse(Optional.ofNullable(u.getEmail()).orElse(""));
            out.add(
                    new MemberRow(
                            Long.toString(u.getId()),
                            displayName,
                            Optional.ofNullable(u.getEmail()).orElse(""),
                            tm.getCapUnits() != null ? tm.getCapUnits().intValue() : null,
                            clampToInt(spend)));
        }
        return out;
    }

    /**
     * Per-member period spend in signed ledger units (debits are negative). Helper so the test
     * slice can override without standing up a real database, and so the controller doesn't inline
     * the negation arithmetic at every call site.
     */
    long memberSpend(Long teamId, Long userId, LocalDateTime start, LocalDateTime end) {
        return ledgerRepo.sumPeriodAmountForMember(
                teamId, userId, LedgerEntryType.DEBIT, start, end);
    }

    private static LocalDateTime[] currentMonthWindow() {
        java.time.YearMonth ym = java.time.YearMonth.now();
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.plusMonths(1).atDay(1).atStartOfDay();
        return new LocalDateTime[] {start, end};
    }

    private static int clampToInt(long v) {
        if (v <= 0) return 0;
        if (v >= Integer.MAX_VALUE) return Integer.MAX_VALUE;
        return (int) v;
    }

    private static int resolveBillableLimit(boolean subscribed, EntitlementSnapshot snap) {
        if (subscribed) {
            // Subscribed teams have no free-tier ceiling — their cap (if any) is what bounds
            // them. FE uses billableLimit only to draw the "X of Y" progress when free; for
            // subscribed users it reads capUsd/noCap. We still return a sane number so any
            // stale UI that reads billableLimit doesn't divide by zero — use the cap if set,
            // else MAX_VALUE-shaped sentinel via Integer.MAX_VALUE.
            Long cap = snap.periodCapUnits();
            if (cap != null) {
                return clampToInt(cap);
            }
            return Integer.MAX_VALUE;
        }
        // Free tier — prefer the per-team cap if a wallet policy already exists (rare for free
        // users), otherwise the fallback free-tier ceiling. PR #6532 will replace this with
        // pricing_policy.free_tier_units_per_cycle.
        Long cap = snap.periodCapUnits();
        if (cap != null) {
            return clampToInt(cap);
        }
        return FREE_TIER_LIMIT_UNITS_FALLBACK;
    }

    private WalletSnapshotResponse emptySnapshot() {
        LocalDateTime[] window = currentMonthWindow();
        return new WalletSnapshotResponse(
                STATUS_FREE,
                ROLE_MEMBER,
                ISO_DATE.format(window[0].toLocalDate()),
                ISO_DATE.format(window[1].toLocalDate()),
                0,
                FREE_TIER_LIMIT_UNITS_FALLBACK,
                null,
                false,
                null,
                0,
                new CategoryBreakdown(0, 0, 0),
                List.of(),
                Collections.emptyList());
    }
}
