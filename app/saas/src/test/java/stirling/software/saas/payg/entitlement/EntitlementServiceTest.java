package stirling.software.saas.payg.entitlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Unit tests for {@link EntitlementService}. Two branches (design 2026-06-11 — the free allowance
 * is a one-time lifetime grant):
 *
 * <ul>
 *   <li><b>Unsubscribed</b> — gated by the grant. Cap = grant size, spend = {@code grant −
 *       remaining}, both read straight from the billing context (no ledger query). Exhausted grant
 *       (remaining ≤ 0) → DEGRADED.
 *   <li><b>Subscribed</b> — gated by the monthly money-derived doc cap. Spend = this period's net
 *       billable units ({@link WalletLedgerRepository#sumPeriodNetBillable} negated, refunds
 *       netted).
 * </ul>
 *
 * Also covers cache hit/miss + the invalidate cascade.
 */
class EntitlementServiceTest {

    private static final LocalDateTime PERIOD_START = LocalDateTime.of(2026, 6, 9, 0, 0);
    private static final LocalDateTime PERIOD_END = LocalDateTime.of(2026, 7, 9, 0, 0);

    private TeamBillingService billingService;
    private WalletPolicyRepository walletPolicyRepo;
    private WalletLedgerRepository ledgerRepo;
    private EntitlementService service;

    @BeforeEach
    void setUp() {
        billingService = Mockito.mock(TeamBillingService.class);
        walletPolicyRepo = Mockito.mock(WalletPolicyRepository.class);
        ledgerRepo = Mockito.mock(WalletLedgerRepository.class);
        service = new EntitlementService(billingService, walletPolicyRepo, ledgerRepo);
    }

    @Test
    void getSnapshot_nullTeamId_throws() {
        assertThatThrownBy(() -> service.getSnapshot(null))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void freeTeam_capIsTheGrantAndSpendIsUsedFromCounter() {
        // Unsubscribed: cap = grant size, spend = grant − remaining — no ledger read.
        stubBilling(42L, freeContext(500L, 400L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodCapUnits()).isEqualTo(500L);
        assertThat(snap.periodSpendUnits()).isEqualTo(100L);
        // 100/500 = 20% — well below warn → FULL
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
        assertThat(snap.featureSet()).isEqualTo(FeatureSet.FULL);
        // The grant gate doesn't touch the ledger at all.
        Mockito.verifyNoInteractions(ledgerRepo);
    }

    @Test
    void subscribedTeam_capIsTheMoneyDerivedDocCap() {
        stubBilling(42L, subscribedContext(2000L));
        when(walletPolicyRepo.findByTeamId(42L))
                .thenReturn(Optional.of(walletPolicyThresholds(FeatureSet.MINIMAL)));
        when(ledgerRepo.sumPeriodNetBillable(eq(42L), any(), any())).thenReturn(-500L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodCapUnits()).isEqualTo(2000L);
        assertThat(snap.periodSpendUnits()).isEqualTo(500L);
        // 500/2000 = 25% — FULL
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void subscribedTeam_refundsNetAgainstSpend() {
        // Net billable = debits − refunds. A −300 net (e.g. 500 debited, 200 refunded) → 300 spend.
        stubBilling(42L, subscribedContext(2000L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodNetBillable(eq(42L), any(), any())).thenReturn(-300L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodSpendUnits()).isEqualTo(300L);
    }

    @Test
    void spendWindow_comesFromBillingContextNotCalendarMonth() {
        stubBilling(42L, subscribedContext(2000L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodNetBillable(eq(42L), any(), any())).thenReturn(0L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        // The subscription-anchored window flows through to both the snapshot and the SUM query.
        assertThat(snap.periodStart()).isEqualTo(PERIOD_START);
        assertThat(snap.periodEnd()).isEqualTo(PERIOD_END);
        verify(ledgerRepo).sumPeriodNetBillable(eq(42L), eq(PERIOD_START), eq(PERIOD_END));
    }

    @Test
    void exhaustedGrant_returnsDegradedWithMinimalGates() {
        // Grant fully consumed (remaining 0) → billable categories hard-stop for an unsubscribed
        // team. The displayed cap stays the grant size; spend reads as the full grant.
        stubBilling(42L, freeContext(100L, 0L));
        when(walletPolicyRepo.findByTeamId(42L))
                .thenReturn(Optional.of(walletPolicyThresholds(FeatureSet.MINIMAL)));

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(snap.featureSet()).isEqualTo(FeatureSet.MINIMAL);
        assertThat(snap.periodCapUnits()).isEqualTo(100L);
        assertThat(snap.periodSpendUnits()).isEqualTo(100L);
        // MINIMAL now keeps OFFSITE_PROCESSING + CLIENT_SIDE (manual tools); AUTOMATION + AI gone.
        assertThat(snap.enabledGates())
                .containsExactlyInAnyOrder(FeatureGate.OFFSITE_PROCESSING, FeatureGate.CLIENT_SIDE);
        assertThat(snap.enabledGates())
                .doesNotContain(FeatureGate.AUTOMATION, FeatureGate.AI_SUPPORT);
    }

    @Test
    void grantInWarnBand_returnsWarnedButFullFeatureSet() {
        // grant 100, remaining 15 → used 85 = 85% (between warn 80 and degrade 100).
        stubBilling(42L, freeContext(100L, 15L));
        when(walletPolicyRepo.findByTeamId(42L))
                .thenReturn(Optional.of(walletPolicyThresholds(FeatureSet.MINIMAL)));

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.state()).isEqualTo(EntitlementState.WARNED);
        assertThat(snap.featureSet()).isEqualTo(FeatureSet.FULL);
        assertThat(snap.enabledGates()).hasSize(4);
    }

    @Test
    void uncappedSubscribedTeam_nullCapNeverDegrades() {
        stubBilling(42L, subscribedContext(null));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodNetBillable(eq(42L), any(), any())).thenReturn(-1_000_000L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodCapUnits()).isNull();
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void positiveNetBillable_treatedAsZeroSpend() {
        // Subscribed defensive: if refunds exceed debits (positive net), spend clamps to zero.
        stubBilling(42L, subscribedContext(100L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodNetBillable(eq(42L), any(), any())).thenReturn(50L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodSpendUnits()).isZero();
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void cacheHit_secondCallSkipsLedgerLookup() {
        stubBilling(42L, subscribedContext(500L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodNetBillable(eq(42L), any(), any())).thenReturn(0L);

        service.getSnapshot(42L);
        service.getSnapshot(42L);
        service.getSnapshot(42L);

        // Only one underlying ledger SUM despite 3 calls — second + third hit the cache.
        verify(ledgerRepo, times(1)).sumPeriodNetBillable(eq(42L), any(), any());
        assertThat(service.cacheSize()).isEqualTo(1);
    }

    @Test
    void invalidate_dropsCacheAndCascadesToBillingService() {
        stubBilling(42L, subscribedContext(500L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodNetBillable(eq(42L), any(), any())).thenReturn(0L);

        service.getSnapshot(42L);
        service.invalidate(42L);
        service.getSnapshot(42L);

        verify(ledgerRepo, times(2)).sumPeriodNetBillable(eq(42L), any(), any());
        // Window/cap facts must recompute together with the spend.
        verify(billingService).invalidate(42L);
    }

    @Test
    void invalidate_otherTeamLeavesEntryAlone() {
        when(billingService.forTeam(any())).thenReturn(subscribedContext(500L));
        when(walletPolicyRepo.findByTeamId(any())).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodNetBillable(any(), any(), any())).thenReturn(0L);

        service.getSnapshot(42L);
        service.invalidate(99L);
        service.getSnapshot(42L);

        // Only one fetch for team 42 — 99 invalidate didn't touch its entry.
        verify(ledgerRepo, times(1)).sumPeriodNetBillable(eq(42L), any(), any());
    }

    @Test
    void currentMonthWindow_isStartOfMonthInclusiveToStartOfNextMonthExclusive() {
        LocalDateTime mid = LocalDateTime.of(2026, 6, 15, 14, 30);
        LocalDateTime[] w = EntitlementService.currentMonthWindow(mid);
        assertThat(w[0]).isEqualTo(LocalDateTime.of(2026, 6, 1, 0, 0));
        assertThat(w[1]).isEqualTo(LocalDateTime.of(2026, 7, 1, 0, 0));
    }

    private void stubBilling(Long teamId, TeamBillingContext ctx) {
        when(billingService.forTeam(teamId)).thenReturn(ctx);
    }

    /** Unsubscribed team: gated by the one-time grant (size + remaining); no monthly cap. */
    private static TeamBillingContext freeContext(long grant, long remaining) {
        return new TeamBillingContext(
                false, null, PERIOD_START, PERIOD_END, grant, remaining, null, null, null, null);
    }

    /**
     * Subscribed team: monthly money-derived paid-doc cap (null = uncapped); grant treated as
     * exhausted (remaining 0 — doesn't gate a paying team).
     */
    private static TeamBillingContext subscribedContext(Long monthlyCapDocUnits) {
        return new TeamBillingContext(
                true,
                "sub_test",
                PERIOD_START,
                PERIOD_END,
                500L,
                0L,
                java.math.BigDecimal.valueOf(2),
                "usd",
                monthlyCapDocUnits == null ? null : monthlyCapDocUnits * 2,
                monthlyCapDocUnits);
    }

    private static WalletPolicy walletPolicyThresholds(FeatureSet degradedSet) {
        WalletPolicy p = new WalletPolicy();
        p.setDegradedFeatureSet(degradedSet);
        p.setWarnAtPct(80);
        p.setDegradeAtPct(100);
        return p;
    }
}
