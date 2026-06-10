package stirling.software.saas.payg.api;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

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
import stirling.software.saas.payg.api.WalletSnapshotResponse.ActivityRow;
import stirling.software.saas.payg.api.WalletSnapshotResponse.CategoryBreakdown;
import stirling.software.saas.payg.api.WalletSnapshotResponse.MemberRow;
import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.entitlement.EntitlementService;
import stirling.software.saas.payg.entitlement.EntitlementSnapshot;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;
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
     * Placeholder ceiling for the team-less empty snapshot only (authenticated caller without a
     * membership — shouldn't happen post-migration). Teams always get the live {@code
     * pricing_policy.free_tier_units_per_cycle} via {@link TeamBillingService}.
     */
    private static final int FREE_TIER_LIMIT_UNITS_FALLBACK = 500;

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private final EntitlementService entitlementService;
    private final TeamBillingService billingService;
    private final TeamMembershipRepository memberRepo;
    private final PaygTeamExtensionsRepository extRepo;
    private final WalletPolicyRepository policyRepo;
    private final WalletLedgerRepository ledgerRepo;
    private final UserRepository userRepository;
    private final RestTemplate saasRestTemplate;
    private final String portalEndpoint;

    /**
     * Bearer for the edge-fn call — the backend↔edge-fn shared secret ({@code
     * SUPABASE_EDGE_FUNCTION_SECRET}), NOT the Supabase service-role key. The edge fn treats it as
     * the trusted-backend marker; the backend never holds an RLS-bypassing credential.
     */
    private final String portalAuthToken;

    private final Set<String> portalReturnUrlAllowedHosts;

    public PaygWalletController(
            EntitlementService entitlementService,
            TeamBillingService billingService,
            TeamMembershipRepository memberRepo,
            PaygTeamExtensionsRepository extRepo,
            WalletPolicyRepository policyRepo,
            WalletLedgerRepository ledgerRepo,
            UserRepository userRepository,
            RestTemplate saasRestTemplate,
            @Value("${payg.portal.endpoint:}") String portalEndpoint,
            @Value("${payg.portal.auth-token:}") String portalAuthToken,
            @Value("${payg.portal.allowed-return-hosts:}") String portalReturnUrlAllowedHostsCsv) {
        this.entitlementService = Objects.requireNonNull(entitlementService, "entitlementService");
        this.billingService = Objects.requireNonNull(billingService, "billingService");
        this.memberRepo = Objects.requireNonNull(memberRepo, "memberRepo");
        this.extRepo = Objects.requireNonNull(extRepo, "extRepo");
        this.policyRepo = Objects.requireNonNull(policyRepo, "policyRepo");
        this.ledgerRepo = Objects.requireNonNull(ledgerRepo, "ledgerRepo");
        this.userRepository = Objects.requireNonNull(userRepository, "userRepository");
        this.saasRestTemplate = Objects.requireNonNull(saasRestTemplate, "saasRestTemplate");
        this.portalEndpoint = portalEndpoint == null ? "" : portalEndpoint;
        this.portalAuthToken = portalAuthToken == null ? "" : portalAuthToken;
        this.portalReturnUrlAllowedHosts = parseHostAllowlist(portalReturnUrlAllowedHostsCsv);
    }

    private static Set<String> parseHostAllowlist(String csv) {
        if (csv == null || csv.isBlank()) {
            return Collections.emptySet();
        }
        Set<String> out = new HashSet<>();
        for (String raw : Arrays.asList(csv.split(","))) {
            String trimmed = raw.trim().toLowerCase(Locale.ROOT);
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
        return Collections.unmodifiableSet(out);
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

        // Billing facts (window, free allowance, per-doc rate, doc cap) and the entitlement
        // snapshot (period spend over that window) share the same composition service, so what
        // the customer sees here is exactly what the 402 guard enforces.
        TeamBillingContext billing = billingService.forTeam(teamId);
        EntitlementSnapshot snap = entitlementService.getSnapshot(teamId);

        String status = billing.subscribed() ? STATUS_SUBSCRIBED : STATUS_FREE;

        boolean noCap = billing.subscribed() && billing.capMoneyMinor() == null;
        Integer capMajor =
                billing.capMoneyMinor() != null
                        ? Math.toIntExact(billing.capMoneyMinor() / 100)
                        : null;

        int spend = clampToInt(snap.periodSpendUnits());
        Integer limit = billing.docCapUnits() != null ? clampToInt(billing.docCapUnits()) : null;

        CategoryBreakdown breakdown = buildBreakdown(teamId, snap.periodStart(), snap.periodEnd());

        Long estimatedBill =
                billingService.estimateBillMinor(billing, snap.periodSpendUnits()).orElse(null);

        List<MemberRow> members =
                isLeader
                        ? buildMemberRows(teamId, snap.periodStart(), snap.periodEnd())
                        : List.of();

        WalletSnapshotResponse body =
                new WalletSnapshotResponse(
                        teamId,
                        status,
                        isLeader ? ROLE_LEADER : ROLE_MEMBER,
                        ISO_DATE.format(snap.periodStart().toLocalDate()),
                        ISO_DATE.format(snap.periodEnd().toLocalDate()),
                        spend,
                        limit,
                        clampToInt(billing.freeAllowanceUnits()),
                        billing.perDocMinor(),
                        billing.currency(),
                        estimatedBill,
                        capMajor,
                        noCap,
                        billing.subscriptionId(),
                        spend,
                        breakdown,
                        members,
                        buildActivity(teamId));
        return ResponseEntity.ok(body);
    }

    private CategoryBreakdown buildBreakdown(
            Long teamId, LocalDateTime periodStart, LocalDateTime periodEnd) {
        Map<BillingCategory, Long> byCategory = new HashMap<>();
        for (Object[] row :
                ledgerRepo.sumPeriodAmountByCategory(
                        teamId, LedgerEntryType.DEBIT, periodStart, periodEnd)) {
            if (row.length >= 2
                    && row[0] instanceof BillingCategory cat
                    && row[1] instanceof Number n) {
                byCategory.put(cat, n.longValue());
            }
        }
        return new CategoryBreakdown(
                clampToInt(byCategory.getOrDefault(BillingCategory.API, 0L)),
                clampToInt(byCategory.getOrDefault(BillingCategory.AI, 0L)),
                clampToInt(byCategory.getOrDefault(BillingCategory.AUTOMATION, 0L)));
    }

    /**
     * Latest ledger entries shaped for the FE activity feed. DEBITs read as usage, REFUNDs as
     * credits-back; system entries without a category render as {@code other}.
     */
    private List<ActivityRow> buildActivity(Long teamId) {
        List<ActivityRow> out = new ArrayList<>();
        for (WalletLedgerEntry e : ledgerRepo.findTop20ByTeamIdOrderByIdDesc(teamId)) {
            BillingCategory category = e.getBillingCategory();
            String kind = category != null ? category.name().toLowerCase(Locale.ROOT) : "other";
            String categoryLabel = category != null ? categoryDisplayName(category) : "Document";
            String label =
                    e.getEntryType() == LedgerEntryType.REFUND
                            ? "Refund — " + categoryLabel
                            : categoryLabel + " usage";
            int docUnits = e.getAmountUnits() == null ? 0 : Math.abs(e.getAmountUnits());
            out.add(
                    new ActivityRow(
                            e.getId(),
                            kind,
                            label,
                            e.getOccurredAt() != null ? e.getOccurredAt().toString() : "",
                            docUnits));
        }
        return out;
    }

    private static String categoryDisplayName(BillingCategory category) {
        return switch (category) {
            case API -> "API";
            case AI -> "AI";
            case AUTOMATION -> "Automation";
            case BYPASSED -> "Manual";
        };
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
            long capMinor = CapMoneyUnits.usdToCents(req.capUsd());
            policy.setCapSourceMoney(capMinor);
            // Derived document allowance (design §10: store both the money intent and the unit
            // translation). The live snapshot recomputes from cap_source_money + current rate;
            // this stored value is the enforcement fallback when the rate is unreachable.
            TeamBillingContext billing = billingService.forTeam(teamId);
            Optional<Long> docCap = billingService.docCapForMoney(billing, capMinor);
            if (docCap.isPresent()) {
                policy.setCapUnits(docCap.get());
            } else {
                // Rate unknown (price-info fn unconfigured / Stripe blip): keep the legacy
                // money-as-units conversion so the cap still binds rather than silently lifting.
                log.warn(
                        "Per-document rate unavailable for team {}; storing legacy cap_units"
                                + " conversion.",
                        teamId);
                policy.setCapUnits(CapMoneyUnits.usdToUnits(req.capUsd()));
            }
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
     * <p>The {@code returnUrl} (optional, body field) is validated against the {@code
     * payg.portal.allowed-return-hosts} allowlist before forwarding to the edge fn — an
     * authenticated attacker can otherwise mint a legit Stripe portal session that bounces the
     * victim back to {@code https://evil.example} after they "Return to Stirling." Defense in
     * depth: even if the Supabase edge fn enforces its own allowlist, we enforce one here too so
     * the security contract is visible in this controller's tests.
     *
     * <p>Transaction scope: the DB lookup (team membership + {@code payg_team_extensions}) runs
     * inside {@link #loadPortalContext}; each Spring Data repo call uses its own short transaction,
     * and the {@code JOIN FETCH} on {@code findPrimaryMembership} eagerly hydrates the team so no
     * lazy access happens later. The outbound HTTP call to Supabase therefore runs with no DB
     * connection held — a slow edge fn cannot pin a HikariCP connection for the full 30s read
     * timeout. Same pattern as {@code PaygMeterReportingService}, which fires from a {@code
     * JobChargeService} afterCommit hook.
     *
     * <p>Status map:
     *
     * <ul>
     *   <li>200 + {@code {url}} — happy path.
     *   <li>400 + {@code {error: "INVALID_RETURN_URL"}} — caller-supplied {@code returnUrl} is
     *       malformed or its host isn't in {@code payg.portal.allowed-return-hosts}.
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
    public ResponseEntity<Map<String, Object>> createPortalSession(
            @Valid @RequestBody(required = false) PortalSessionRequest req, Authentication auth) {
        if (portalEndpoint.isBlank()) {
            // Local dev / unit tests without Supabase configured — return a clean 503 instead of
            // letting RestTemplate explode on a blank URL.
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "PORTAL_NOT_CONFIGURED"));
        }

        // returnUrl is the only optional field on the body; the body itself is optional too, so a
        // caller that doesn't care about a custom return URL can POST with no body at all and let
        // the edge fn fall back to its configured default.
        String requestedReturnUrl = req == null ? null : req.returnUrl();
        if (requestedReturnUrl != null
                && !requestedReturnUrl.isBlank()
                && !isReturnUrlAllowed(requestedReturnUrl)) {
            log.warn("Portal session rejected: returnUrl host not on allowlist");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "INVALID_RETURN_URL"));
        }

        // DB work is in its own readOnly tx; the HTTP call runs outside any transaction.
        PortalContext ctx;
        try {
            ctx = loadPortalContext(auth);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (ctx.notFoundReason() != null) {
            return ResponseEntity.status(ctx.status()).body(Map.of("error", ctx.notFoundReason()));
        }
        if (ctx.status() != HttpStatus.OK) {
            return ResponseEntity.status(ctx.status()).build();
        }

        Long teamId = ctx.teamId();
        try {
            HttpHeaders headers = new HttpHeaders();
            if (!portalAuthToken.isBlank()) {
                headers.setBearerAuth(portalAuthToken);
            }
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> body = new HashMap<>();
            // MUST be a JSON number: the edge fn checks `typeof body.team_id === "number"` and
            // silently ignores strings — with a service-role bearer that ignored filter would
            // make it fall back to `.limit(1)` over ALL teams and mint the wrong team's portal.
            body.put("team_id", teamId);
            if (requestedReturnUrl != null && !requestedReturnUrl.isBlank()) {
                body.put("return_url", requestedReturnUrl);
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
     * Loads the team + subscription state needed by {@link #createPortalSession}.
     *
     * <p>Each Spring Data repo call gets its own short transaction (managed by the repository
     * proxy); {@link TeamMembershipRepository#findPrimaryMembership} uses {@code JOIN FETCH} so the
     * returned {@link TeamMembership#getTeam()} is fully initialised — no lazy access happens after
     * the call returns. Crucially, by the time this method returns there is <em>no</em> active
     * transaction, so the outbound RestTemplate call in {@link #createPortalSession} runs with no
     * DB connection held. We deliberately do <em>not</em> mark this {@code @Transactional} because
     * Spring's self-invocation proxy semantics mean the annotation would be silently no-op when
     * called via {@code this.loadPortalContext(...)}, which is exactly how it is called below.
     * Documenting the intent here rather than relying on a non-functional annotation.
     *
     * <p>Returned {@link PortalContext#status} drives the caller's response: {@code OK} means
     * forward to the edge fn, anything else short-circuits with that status (and the optional
     * {@code notFoundReason} error body for the 404 case).
     */
    PortalContext loadPortalContext(Authentication auth) {
        User user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        Optional<TeamMembership> primary = primaryMembership(user.getId());
        if (primary.isEmpty()) {
            // Authenticated but no team → no Stripe customer can exist for them. 403 mirrors the
            // cap endpoints' "no team to act on" response.
            return new PortalContext(null, HttpStatus.FORBIDDEN, null);
        }
        Long teamId = primary.get().getTeam().getId();
        Optional<PaygTeamExtensions> extOpt = extRepo.findById(teamId);
        if (!isSubscribed(extOpt)) {
            // Free-tier team — no Stripe customer means no portal to open. The FE shows "Subscribe
            // first" rather than a generic error toast.
            return new PortalContext(teamId, HttpStatus.NOT_FOUND, "TEAM_NOT_SUBSCRIBED");
        }
        return new PortalContext(teamId, HttpStatus.OK, null);
    }

    /** Snapshot of the DB state used by {@link #createPortalSession}. Package-private for tests. */
    record PortalContext(Long teamId, HttpStatus status, String notFoundReason) {}

    /**
     * Returns {@code true} iff the caller-supplied {@code returnUrl} parses cleanly and its host
     * appears in {@code payg.portal.allowed-return-hosts}. If the allowlist is empty we reject any
     * caller-supplied {@code returnUrl} — the operator must explicitly opt-in to which hosts the
     * portal may redirect through. Match is case-insensitive on host; scheme is restricted to
     * {@code https} (and {@code http} for local-dev tools that pin to {@code localhost}) so a
     * caller can't smuggle a {@code javascript:} or {@code data:} URL past the edge fn.
     */
    private boolean isReturnUrlAllowed(String returnUrl) {
        if (portalReturnUrlAllowedHosts.isEmpty()) {
            return false;
        }
        URI uri;
        try {
            uri = new URI(returnUrl);
        } catch (URISyntaxException e) {
            return false;
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null) {
            return false;
        }
        String lowerScheme = scheme.toLowerCase(Locale.ROOT);
        if (!"https".equals(lowerScheme) && !"http".equals(lowerScheme)) {
            return false;
        }
        return portalReturnUrlAllowedHosts.contains(host.toLowerCase(Locale.ROOT));
    }

    /**
     * Request body for {@link #createPortalSession}. {@code returnUrl} is optional — if blank /
     * null the edge function falls back to its configured default. We validate the URL's host
     * against {@code payg.portal.allowed-return-hosts} before forwarding; see {@link
     * #createPortalSession} for the security rationale.
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

    private List<MemberRow> buildMemberRows(
            Long teamId, LocalDateTime periodStart, LocalDateTime periodEnd) {
        List<TeamMembership> all = memberRepo.findByTeamId(teamId);
        if (all.isEmpty()) {
            return List.of();
        }
        LocalDateTime[] window = {periodStart, periodEnd};
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

    private WalletSnapshotResponse emptySnapshot() {
        LocalDateTime[] window = currentMonthWindow();
        return new WalletSnapshotResponse(
                null, // teamId — unknown when the caller has no team membership
                STATUS_FREE,
                ROLE_MEMBER,
                ISO_DATE.format(window[0].toLocalDate()),
                ISO_DATE.format(window[1].toLocalDate()),
                0,
                FREE_TIER_LIMIT_UNITS_FALLBACK,
                FREE_TIER_LIMIT_UNITS_FALLBACK,
                null,
                null,
                null,
                null,
                false,
                null,
                0,
                new CategoryBreakdown(0, 0, 0),
                List.of(),
                Collections.emptyList());
    }
}
