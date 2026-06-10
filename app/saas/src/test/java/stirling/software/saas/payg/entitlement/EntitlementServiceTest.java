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
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Unit tests for {@link EntitlementService}: the document cap + billing window come from {@link
 * TeamBillingService}; this service layers period spend (ledger SUM over that window) and the
 * warn/degrade evaluation on top. Covers spend negation, threshold bands, cache hit/miss +
 * invalidate cascade.
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
    void freeTeam_capIsTheFreeAllowanceFromBillingContext() {
        stubBilling(42L, freeContext(500L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(-100L); // 100 units spent (signed negative in ledger)

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodCapUnits()).isEqualTo(500L);
        assertThat(snap.periodSpendUnits()).isEqualTo(100L);
        // 100/500 = 20% — well below warn → FULL
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
        assertThat(snap.featureSet()).isEqualTo(FeatureSet.FULL);
    }

    @Test
    void subscribedTeam_capIsTheMoneyDerivedDocCap() {
        stubBilling(42L, subscribedContext(2000L));
        when(walletPolicyRepo.findByTeamId(42L))
                .thenReturn(Optional.of(walletPolicyThresholds(FeatureSet.MINIMAL)));
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(-500L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodCapUnits()).isEqualTo(2000L);
        assertThat(snap.periodSpendUnits()).isEqualTo(500L);
        // 500/2000 = 25% — FULL
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void spendWindow_comesFromBillingContextNotCalendarMonth() {
        stubBilling(42L, subscribedContext(2000L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(0L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        // The subscription-anchored window flows through to both the snapshot and the SUM query.
        assertThat(snap.periodStart()).isEqualTo(PERIOD_START);
        assertThat(snap.periodEnd()).isEqualTo(PERIOD_END);
        verify(ledgerRepo)
                .sumPeriodAmount(
                        eq(42L), eq(LedgerEntryType.DEBIT), eq(PERIOD_START), eq(PERIOD_END));
    }

    @Test
    void spendAtDegradeThreshold_returnsDegradedWithMinimalGates() {
        stubBilling(42L, freeContext(100L));
        when(walletPolicyRepo.findByTeamId(42L))
                .thenReturn(Optional.of(walletPolicyThresholds(FeatureSet.MINIMAL)));
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(-100L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(snap.featureSet()).isEqualTo(FeatureSet.MINIMAL);
        // MINIMAL now keeps OFFSITE_PROCESSING + CLIENT_SIDE (manual tools); AUTOMATION + AI gone.
        assertThat(snap.enabledGates())
                .containsExactlyInAnyOrder(FeatureGate.OFFSITE_PROCESSING, FeatureGate.CLIENT_SIDE);
        assertThat(snap.enabledGates())
                .doesNotContain(FeatureGate.AUTOMATION, FeatureGate.AI_SUPPORT);
    }

    @Test
    void spendInWarnBand_returnsWarnedButFullFeatureSet() {
        stubBilling(42L, freeContext(100L));
        when(walletPolicyRepo.findByTeamId(42L))
                .thenReturn(Optional.of(walletPolicyThresholds(FeatureSet.MINIMAL)));
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(-85L); // 85% — between warn(80) and degrade(100)

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.state()).isEqualTo(EntitlementState.WARNED);
        assertThat(snap.featureSet()).isEqualTo(FeatureSet.FULL);
        assertThat(snap.enabledGates()).hasSize(4);
    }

    @Test
    void uncappedSubscribedTeam_nullCapNeverDegrades() {
        stubBilling(42L, subscribedContext(null));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(-1_000_000L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodCapUnits()).isNull();
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void positiveSignedSum_treatedAsZeroSpend() {
        // Defensive: if the ledger has only credits (positive SUM), spend is zero.
        stubBilling(42L, freeContext(100L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(50L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodSpendUnits()).isZero();
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void cacheHit_secondCallSkipsLedgerLookup() {
        stubBilling(42L, freeContext(500L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(0L);

        service.getSnapshot(42L);
        service.getSnapshot(42L);
        service.getSnapshot(42L);

        // Only one underlying ledger SUM despite 3 calls — second + third hit the cache.
        verify(ledgerRepo, times(1))
                .sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any());
        assertThat(service.cacheSize()).isEqualTo(1);
    }

    @Test
    void invalidate_dropsCacheAndCascadesToBillingService() {
        stubBilling(42L, freeContext(500L));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(0L);

        service.getSnapshot(42L);
        service.invalidate(42L);
        service.getSnapshot(42L);

        verify(ledgerRepo, times(2))
                .sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any());
        // Window/cap facts must recompute together with the spend.
        verify(billingService).invalidate(42L);
    }

    @Test
    void invalidate_otherTeamLeavesEntryAlone() {
        when(billingService.forTeam(any())).thenReturn(freeContext(500L));
        when(walletPolicyRepo.findByTeamId(any())).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(any(), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(0L);

        service.getSnapshot(42L);
        service.invalidate(99L);
        service.getSnapshot(42L);

        // Only one fetch for team 42 — 99 invalidate didn't touch its entry.
        verify(ledgerRepo, times(1))
                .sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any());
    }

    @Test
    void currentMonthWindow_isStartOfMonthInclusiveToStartOfNextMonthExclusive() {
        LocalDateTime mid = LocalDateTime.of(2026, 6, 15, 14, 30);
        LocalDateTime[] w = EntitlementService.currentMonthWindow(mid);
        assertThat(w[0]).isEqualTo(LocalDateTime.of(2026, 6, 1, 0, 0));
        assertThat(w[1]).isEqualTo(LocalDateTime.of(2026, 7, 1, 0, 0));
    }

    @Test
    void anonymousFull_isFullAndUncapped() {
        EntitlementSnapshot snap = EntitlementService.anonymousFull();
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
        assertThat(snap.periodCapUnits()).isNull();
        assertThat(snap.enabledGates())
                .contains(
                        FeatureGate.OFFSITE_PROCESSING,
                        FeatureGate.AUTOMATION,
                        FeatureGate.AI_SUPPORT,
                        FeatureGate.CLIENT_SIDE);
    }

    private void stubBilling(Long teamId, TeamBillingContext ctx) {
        when(billingService.forTeam(teamId)).thenReturn(ctx);
    }

    /** Free team: cap == free allowance, no subscription facts. */
    private static TeamBillingContext freeContext(Long docCap) {
        return new TeamBillingContext(
                false,
                null,
                PERIOD_START,
                PERIOD_END,
                docCap == null ? 0L : docCap,
                null,
                null,
                null,
                docCap);
    }

    /** Subscribed team: money-derived doc cap (null = uncapped). */
    private static TeamBillingContext subscribedContext(Long docCap) {
        return new TeamBillingContext(
                true,
                "sub_test",
                PERIOD_START,
                PERIOD_END,
                500L,
                java.math.BigDecimal.valueOf(2),
                "usd",
                docCap == null ? null : (docCap - 500L) * 2,
                docCap);
    }

    private static WalletPolicy walletPolicyThresholds(FeatureSet degradedSet) {
        WalletPolicy p = new WalletPolicy();
        p.setDegradedFeatureSet(degradedSet);
        p.setWarnAtPct(80);
        p.setDegradeAtPct(100);
        return p;
    }
}
