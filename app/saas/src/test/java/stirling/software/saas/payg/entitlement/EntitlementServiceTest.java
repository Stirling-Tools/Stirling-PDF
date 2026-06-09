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

import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Unit tests for {@link EntitlementService}: cap resolution (wallet policy vs default free-tier),
 * spend window computation, cache hit/miss + invalidate, and snapshot shape for FULL / WARNED /
 * DEGRADED bands.
 */
class EntitlementServiceTest {

    private PaygTeamExtensionsRepository extensionsRepo;
    private WalletPolicyRepository walletPolicyRepo;
    private WalletLedgerRepository ledgerRepo;
    private EntitlementService service;

    @BeforeEach
    void setUp() {
        extensionsRepo = Mockito.mock(PaygTeamExtensionsRepository.class);
        walletPolicyRepo = Mockito.mock(WalletPolicyRepository.class);
        ledgerRepo = Mockito.mock(WalletLedgerRepository.class);
        service = new EntitlementService(extensionsRepo, walletPolicyRepo, ledgerRepo);
    }

    @Test
    void getSnapshot_nullTeamId_throws() {
        assertThatThrownBy(() -> service.getSnapshot(null))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void noWalletPolicy_usesDefaultFreeTierCap() {
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(-100L); // 100 units spent (signed negative in ledger)

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodCapUnits()).isEqualTo(EntitlementService.DEFAULT_FREE_TIER_UNITS);
        assertThat(snap.periodSpendUnits()).isEqualTo(100L);
        // 100/500 = 20% — well below warn → FULL
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
        assertThat(snap.featureSet()).isEqualTo(FeatureSet.FULL);
    }

    @Test
    void walletPolicyPresent_usesCapUnitsFromPolicy() {
        WalletPolicy policy = walletPolicyWithCap(2000L, FeatureSet.MINIMAL);
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.of(policy));
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(-500L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodCapUnits()).isEqualTo(2000L);
        assertThat(snap.periodSpendUnits()).isEqualTo(500L);
        // 500/2000 = 25% — FULL
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void spendAtDegradeThreshold_returnsDegradedWithMinimalGates() {
        WalletPolicy policy = walletPolicyWithCap(100L, FeatureSet.MINIMAL);
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.of(policy));
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
        WalletPolicy policy = walletPolicyWithCap(100L, FeatureSet.MINIMAL);
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.of(policy));
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(-85L); // 85% — between warn(80) and degrade(100)

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.state()).isEqualTo(EntitlementState.WARNED);
        assertThat(snap.featureSet()).isEqualTo(FeatureSet.FULL);
        assertThat(snap.enabledGates()).hasSize(4);
    }

    @Test
    void positiveSignedSum_treatedAsZeroSpend() {
        // Defensive: if the ledger has only credits (positive SUM), spend is zero.
        WalletPolicy policy = walletPolicyWithCap(100L, FeatureSet.MINIMAL);
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.of(policy));
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(50L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodSpendUnits()).isZero();
        assertThat(snap.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void cacheHit_secondCallSkipsLedgerLookup() {
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());
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
    void invalidate_dropsCacheAndForcesRecompute() {
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(0L);

        service.getSnapshot(42L);
        service.invalidate(42L);
        service.getSnapshot(42L);

        verify(ledgerRepo, times(2))
                .sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any());
    }

    @Test
    void invalidate_otherTeamLeavesEntryAlone() {
        when(extensionsRepo.findById(any())).thenReturn(Optional.empty());
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
    void teamExtensionsPresent_doesNotChangeOutcomeOnPreSubscriptionBranch() {
        // Pre-#6532 the team_extensions row carries no subscription field — its presence shouldn't
        // change cap resolution.
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(42L);
        when(extensionsRepo.findById(42L)).thenReturn(Optional.of(ext));
        when(walletPolicyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(ledgerRepo.sumPeriodAmount(eq(42L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(0L);

        EntitlementSnapshot snap = service.getSnapshot(42L);

        assertThat(snap.periodCapUnits()).isEqualTo(EntitlementService.DEFAULT_FREE_TIER_UNITS);
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

    private static WalletPolicy walletPolicyWithCap(Long capUnits, FeatureSet degradedSet) {
        WalletPolicy p = new WalletPolicy();
        p.setCapUnits(capUnits);
        p.setDegradedFeatureSet(degradedSet);
        p.setWarnAtPct(80);
        p.setDegradeAtPct(100);
        return p;
    }
}
