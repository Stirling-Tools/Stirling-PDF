package stirling.software.saas.payg.api;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

    public PaygWalletController(
            EntitlementService entitlementService,
            TeamBillingService billingService,
            TeamMembershipRepository memberRepo,
            PaygTeamExtensionsRepository extRepo,
            WalletPolicyRepository policyRepo,
            WalletLedgerRepository ledgerRepo,
            UserRepository userRepository) {
        this.entitlementService = Objects.requireNonNull(entitlementService, "entitlementService");
        this.billingService = Objects.requireNonNull(billingService, "billingService");
        this.memberRepo = Objects.requireNonNull(memberRepo, "memberRepo");
        this.extRepo = Objects.requireNonNull(extRepo, "extRepo");
        this.policyRepo = Objects.requireNonNull(policyRepo, "policyRepo");
        this.ledgerRepo = Objects.requireNonNull(ledgerRepo, "ledgerRepo");
        this.userRepository = Objects.requireNonNull(userRepository, "userRepository");
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
    // Helpers
    // ---------------------------------------------------------------------------------------

    private Optional<TeamMembership> primaryMembership(Long userId) {
        List<TeamMembership> rows = memberRepo.findPrimaryMembership(userId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
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
