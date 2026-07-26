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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.payg.api.WalletSnapshotResponse.ActivityRow;
import stirling.software.saas.payg.api.WalletSnapshotResponse.CategoryBreakdown;
import stirling.software.saas.payg.api.WalletSnapshotResponse.MemberRow;
import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.bundle.PrepaidBundleService;
import stirling.software.saas.payg.entitlement.EntitlementService;
import stirling.software.saas.payg.entitlement.EntitlementSnapshot;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygShadowChargeRepository;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;
import stirling.software.saas.payg.wallet.WalletPolicy;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Read + cap-mutation surface backing the FE PAYG Plan page.
 *
 * <p>{@code GET /api/v1/payg/wallet} is the single fetch the {@code useWallet} hook calls. Returns
 * a fully-populated {@link WalletSnapshotResponse} — derived from {@link EntitlementService} (for
 * spend / cap / period), {@link PaygTeamExtensions} (for subscription state), and {@link
 * WalletLedgerRepository} (for the per-category breakdown widget). Leader callers also get a roster
 * of team members + their per-member usage; member callers see an empty roster.
 *
 * <p>{@code PATCH /api/v1/payg/cap} updates {@code wallet_policy.cap_units} (no Stripe call — the
 * cap is enforced application-side via the entitlement guard) and invalidates the team's snapshot
 * cache so the next read reflects the change immediately. Only leaders may call this; the team is
 * derived from the caller, so we authorise inside the method rather than via {@code @PreAuthorize}
 * — the team id never appears on the path or query string.
 *
 * <p>Subscription state is sourced from {@code payg_team_extensions.payg_subscription_id} (added in
 * V14): {@code stripeSubscriptionId} echoes it via {@link TeamBillingService}, and a team reads as
 * {@link #STATUS_SUBSCRIBED} once {@code billing.subscribed()} is true — i.e. it has a subscription
 * id, or a Stripe customer id as the pre-webhook bridge for a just-completed checkout whose
 * subscription-created webhook hasn't landed yet (see {@code TeamBillingService.compute}).
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
    static final String BILLING_MODE_PREPAID = "prepaid";
    static final String BILLING_MODE_PAYG = "payg";

    /**
     * Placeholder ceiling for the team-less empty snapshot only (authenticated caller without a
     * membership — shouldn't happen post-migration). Teams always get the live {@code
     * pricing_policy.free_tier_units} grant via {@link TeamBillingService}.
     */
    private static final int FREE_TIER_LIMIT_UNITS_FALLBACK = 500;

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private final EntitlementService entitlementService;
    private final TeamBillingService billingService;
    private final TeamMembershipRepository memberRepo;
    private final PaygTeamExtensionsRepository extRepo;
    private final WalletPolicyRepository policyRepo;
    private final WalletLedgerRepository ledgerRepo;
    private final PaygShadowChargeRepository shadowRepo;
    private final UserRepository userRepository;
    private final PrepaidBundleService prepaidBundleService;

    public PaygWalletController(
            EntitlementService entitlementService,
            TeamBillingService billingService,
            TeamMembershipRepository memberRepo,
            PaygTeamExtensionsRepository extRepo,
            WalletPolicyRepository policyRepo,
            WalletLedgerRepository ledgerRepo,
            PaygShadowChargeRepository shadowRepo,
            UserRepository userRepository,
            PrepaidBundleService prepaidBundleService) {
        this.entitlementService = Objects.requireNonNull(entitlementService, "entitlementService");
        this.billingService = Objects.requireNonNull(billingService, "billingService");
        this.memberRepo = Objects.requireNonNull(memberRepo, "memberRepo");
        this.extRepo = Objects.requireNonNull(extRepo, "extRepo");
        this.policyRepo = Objects.requireNonNull(policyRepo, "policyRepo");
        this.ledgerRepo = Objects.requireNonNull(ledgerRepo, "ledgerRepo");
        this.shadowRepo = Objects.requireNonNull(shadowRepo, "shadowRepo");
        this.userRepository = Objects.requireNonNull(userRepository, "userRepository");
        this.prepaidBundleService =
                Objects.requireNonNull(prepaidBundleService, "prepaidBundleService");
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

        // Per-state by construction (see EntitlementService.computeSnapshot): free team → spend is
        // lifetime free used, cap is the grant size; subscribed → spend is this month's net
        // billable
        // docs, cap is the monthly paid-doc ceiling (null = uncapped).
        int spend = clampToInt(snap.periodSpendUnits());
        Integer limit = snap.periodCapUnits() != null ? clampToInt(snap.periodCapUnits()) : null;

        BreakdownPair breakdowns = buildBreakdowns(teamId, snap.periodStart(), snap.periodEnd());
        UsageAnalytics analytics =
                buildUsageAnalytics(teamId, snap.periodStart(), snap.periodEnd());

        // Estimated bill = paid (Stripe-metered) docs this period × rate — the free portion was
        // already netted out at charge time, so this is the metered total, not spend − grant.
        long periodPaid = shadowRepo.sumPaidUnits(teamId, snap.periodStart(), snap.periodEnd());
        Long estimatedBill = billingService.estimateBillMinor(billing, periodPaid).orElse(null);

        List<MemberRow> members =
                isLeader
                        ? buildMemberRows(teamId, snap.periodStart(), snap.periodEnd())
                        : List.of();

        // Prepaid bundles, aggregated across the team's in-term pools. Drawn ahead of the meter and
        // kept out of the spend cap, so they're a separate dimension from the metered spend above.
        PrepaidBundleService.PrepaidSummary prepaid = prepaidBundleService.summarize(teamId);
        long prepaidRemaining = prepaid == null ? 0L : prepaid.unitsRemaining();
        long prepaidTotal = prepaid == null ? 0L : prepaid.unitsTotal();
        String prepaidExpiresAt =
                prepaid == null || prepaid.expiresAt() == null
                        ? null
                        : ISO_DATE.format(prepaid.expiresAt().toLocalDate());
        // Prepaid while pools still have units to draw; once exhausted the meter is live again.
        String billingMode = prepaidRemaining > 0 ? BILLING_MODE_PREPAID : BILLING_MODE_PAYG;

        WalletSnapshotResponse body =
                new WalletSnapshotResponse(
                        teamId,
                        status,
                        isLeader ? ROLE_LEADER : ROLE_MEMBER,
                        ISO_DATE.format(snap.periodStart().toLocalDate()),
                        ISO_DATE.format(snap.periodEnd().toLocalDate()),
                        spend,
                        limit,
                        clampToInt(billing.freeGrantUnits()),
                        clampToInt(billing.freeRemainingUnits()),
                        billing.perDocMinor(),
                        billing.currency(),
                        estimatedBill,
                        capMajor,
                        noCap,
                        billing.subscriptionId(),
                        spend,
                        breakdowns.units(),
                        members,
                        buildActivity(teamId),
                        breakdowns.docs(),
                        analytics.docsProcessed(),
                        analytics.uniquePdfs(),
                        analytics.sizeMultiplierPdfs(),
                        prepaidRemaining,
                        prepaidTotal,
                        prepaidExpiresAt,
                        billingMode);
        return ResponseEntity.ok(body);
    }

    /** Per-category size-scaled units + input-file counts for the same window. */
    private record BreakdownPair(CategoryBreakdown units, CategoryBreakdown docs) {}

    /** Period usage analytics: total input files, unique PDFs, and size-multiplier files. */
    private record UsageAnalytics(int docsProcessed, int uniquePdfs, int sizeMultiplierPdfs) {}

    private BreakdownPair buildBreakdowns(
            Long teamId, LocalDateTime periodStart, LocalDateTime periodEnd) {
        Map<BillingCategory, Long> units = new HashMap<>();
        Map<BillingCategory, Long> docs = new HashMap<>();
        for (Object[] row :
                ledgerRepo.sumPeriodByCategoryWithDocs(
                        teamId, LedgerEntryType.DEBIT, periodStart, periodEnd)) {
            if (row.length >= 3 && row[0] instanceof BillingCategory cat) {
                if (row[1] instanceof Number u) {
                    units.put(cat, u.longValue());
                }
                if (row[2] instanceof Number d) {
                    docs.put(cat, d.longValue());
                }
            }
        }
        return new BreakdownPair(categoryBreakdown(units), categoryBreakdown(docs));
    }

    private static CategoryBreakdown categoryBreakdown(Map<BillingCategory, Long> byCategory) {
        return new CategoryBreakdown(
                clampToInt(byCategory.getOrDefault(BillingCategory.API, 0L)),
                clampToInt(byCategory.getOrDefault(BillingCategory.AI, 0L)),
                clampToInt(byCategory.getOrDefault(BillingCategory.AUTOMATION, 0L)));
    }

    private UsageAnalytics buildUsageAnalytics(
            Long teamId, LocalDateTime periodStart, LocalDateTime periodEnd) {
        List<Object[]> rows =
                ledgerRepo.periodUsageAnalytics(
                        teamId, LedgerEntryType.DEBIT, periodStart, periodEnd);
        Object[] row = rows.isEmpty() ? null : rows.get(0);
        return new UsageAnalytics(analyticsInt(row, 0), analyticsInt(row, 1), analyticsInt(row, 2));
    }

    private static int analyticsInt(Object[] row, int idx) {
        return row != null && row.length > idx && row[idx] instanceof Number n
                ? clampToInt(n.longValue())
                : 0;
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
            // Derived document allowance: store both the money intent and the unit translation.
            // The live snapshot recomputes from cap_source_money + current rate; this stored value
            // is the enforcement fallback when the rate is unreachable.
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
    // POST /wallet/refresh — drop the caller's cached snapshot so the next read is fresh
    // ---------------------------------------------------------------------------------------

    /**
     * Drops the caller's team snapshot + billing cache so the next {@code GET /wallet} reflects a
     * billing state that just changed out-of-band. The subscription flip is written by a Postgres
     * function ({@code payg_link_subscription}) with no Java event to invalidate on, so a client
     * that knows a change just happened — the portal while finalizing a checkout — pokes the cache
     * here rather than waiting out the ~30s TTL. Team-scoped to the caller: a client can only
     * refresh its own team, and a no-team caller is a cheap no-op.
     */
    @PostMapping("/wallet/refresh")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> refreshWallet(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        primaryMembership(user.getId())
                .ifPresent(m -> entitlementService.invalidate(m.getTeam().getId()));
        return ResponseEntity.noContent().build();
    }

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
                Collections.emptyList(),
                new CategoryBreakdown(0, 0, 0),
                0,
                0,
                0,
                0L,
                0L,
                null,
                BILLING_MODE_PAYG);
    }
}
