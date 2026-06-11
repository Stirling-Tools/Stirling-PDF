package stirling.software.saas.payg.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.payg.api.PaygWalletController.UpdateCapRequest;
import stirling.software.saas.payg.api.WalletSnapshotResponse.MemberRow;
import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.entitlement.EntitlementService;
import stirling.software.saas.payg.entitlement.EntitlementSnapshot;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.repository.PaygShadowChargeRepository;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletPolicy;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;

/**
 * Pure-Mockito unit tests for {@link PaygWalletController}. Covers the documented role / state
 * matrix — free vs subscribed, leader vs member, anonymous — plus the cap update endpoint's
 * leader-only enforcement and cache invalidation.
 */
@ExtendWith(MockitoExtension.class)
class PaygWalletControllerTest {

    @Mock private EntitlementService entitlementService;
    @Mock private TeamBillingService billingService;
    @Mock private TeamMembershipRepository memberRepo;
    @Mock private PaygTeamExtensionsRepository extRepo;
    @Mock private WalletPolicyRepository policyRepo;
    @Mock private WalletLedgerRepository ledgerRepo;
    @Mock private PaygShadowChargeRepository shadowRepo;
    @Mock private UserRepository userRepository;

    private PaygWalletController controller;

    @BeforeEach
    void setUp() {
        controller =
                new PaygWalletController(
                        entitlementService,
                        billingService,
                        memberRepo,
                        extRepo,
                        policyRepo,
                        ledgerRepo,
                        shadowRepo,
                        userRepository);
    }

    /**
     * Free-team billing context: the one-time grant is fully unused (remaining == grant), no
     * subscription facts, no monthly cap. The displayed limit comes from the snapshot, not here.
     */
    private static TeamBillingContext freeBilling(long teamFreeGrant) {
        LocalDateTime start = LocalDate.now().withDayOfMonth(1).atStartOfDay();
        return new TeamBillingContext(
                false,
                null,
                start,
                start.plusMonths(1),
                teamFreeGrant,
                teamFreeGrant,
                null,
                null,
                null,
                null);
    }

    /**
     * Subscribed billing context with a money cap (minor units) and a known per-doc rate. The grant
     * is treated as exhausted (remaining 0) — typical for a team that has subscribed; {@code
     * monthlyCapDocUnits} is the paid-doc ceiling {@code floor(capMoney / rate)}.
     */
    private static TeamBillingContext subscribedBilling(
            String subscriptionId, Long capMoneyMinor, Long monthlyCapDocUnits) {
        LocalDateTime start = LocalDate.now().withDayOfMonth(1).atStartOfDay();
        return new TeamBillingContext(
                true,
                subscriptionId,
                start,
                start.plusMonths(1),
                500L,
                0L,
                BigDecimal.valueOf(2),
                "usd",
                capMoneyMinor,
                monthlyCapDocUnits);
    }

    private void stubEmptyLedgerReads(long teamId) {
        when(ledgerRepo.sumPeriodAmountByCategory(
                        eq(teamId), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(List.of());
        when(ledgerRepo.findTop20ByTeamIdOrderByIdDesc(teamId)).thenReturn(List.of());
    }

    // -----------------------------------------------------------------------------------------
    // GET /wallet
    // -----------------------------------------------------------------------------------------

    @Test
    void getWallet_freeTier_returnsFreeShape() {
        User user = userWithId(7L, UUID.randomUUID());
        Team team = teamWithId(42L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(7L))
                .thenReturn(List.of(membership(team, user, TeamRole.MEMBER)));
        when(billingService.forTeam(42L)).thenReturn(freeBilling(500L));
        when(entitlementService.getSnapshot(42L)).thenReturn(snapshot(0L, 500L));
        stubEmptyLedgerReads(42L);

        ResponseEntity<WalletSnapshotResponse> resp =
                controller.getWallet(jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        WalletSnapshotResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.status()).isEqualTo("free");
        assertThat(body.role()).isEqualTo("member");
        assertThat(body.capUsd()).isNull();
        assertThat(body.stripeSubscriptionId()).isNull();
        assertThat(body.noCap()).isFalse();
        assertThat(body.billableUsed()).isZero();
        assertThat(body.billableLimit()).isEqualTo(500);
        assertThat(body.freeAllowance()).isEqualTo(500);
        assertThat(body.pricePerDocMinor()).isNull();
        assertThat(body.currency()).isNull();
        assertThat(body.estimatedBillMinor()).isNull();
        assertThat(body.members()).isEmpty();
        assertThat(body.recent()).isEmpty();
        assertThat(body.categoryBreakdown().api()).isZero();
        assertThat(body.categoryBreakdown().ai()).isZero();
        assertThat(body.categoryBreakdown().automation()).isZero();
    }

    @Test
    void getWallet_subscribedMember_returnsCapAndBreakdownFromLedger() {
        User user = userWithId(8L, UUID.randomUUID());
        Team team = teamWithId(99L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(8L))
                .thenReturn(List.of(membership(team, user, TeamRole.MEMBER)));
        // $25 cap (2500 minor) at $0.02/doc → 1250 paid docs/month (the one-time grant is a
        // separate pool, not added to the cap).
        when(billingService.forTeam(99L))
                .thenReturn(subscribedBilling("sub_test_99", 2500L, 1250L));
        // 312 paid (metered) docs this period → estimate 312 × $0.02 = $6.24 (624 minor).
        when(shadowRepo.sumPaidUnits(eq(99L), any(), any())).thenReturn(312L);
        when(billingService.estimateBillMinor(any(), eq(312L))).thenReturn(Optional.of(624L));
        when(entitlementService.getSnapshot(99L)).thenReturn(snapshot(312L, 1250L));
        when(ledgerRepo.sumPeriodAmountByCategory(eq(99L), eq(LedgerEntryType.DEBIT), any(), any()))
                .thenReturn(
                        List.of(
                                new Object[] {BillingCategory.API, 110L},
                                new Object[] {BillingCategory.AI, 200L},
                                new Object[] {BillingCategory.AUTOMATION, 2L}));
        when(ledgerRepo.findTop20ByTeamIdOrderByIdDesc(99L)).thenReturn(List.of());

        ResponseEntity<WalletSnapshotResponse> resp =
                controller.getWallet(jwtAuth(user.getSupabaseId()));

        WalletSnapshotResponse body = resp.getBody();
        assertThat(body.status()).isEqualTo("subscribed");
        assertThat(body.role()).isEqualTo("member");
        assertThat(body.capUsd()).isEqualTo(25);
        assertThat(body.noCap()).isFalse();
        assertThat(body.billableUsed()).isEqualTo(312);
        assertThat(body.spendUnitsThisPeriod()).isEqualTo(312);
        assertThat(body.billableLimit()).isEqualTo(1250);
        assertThat(body.freeAllowance()).isEqualTo(500);
        assertThat(body.pricePerDocMinor()).isEqualByComparingTo(BigDecimal.valueOf(2));
        assertThat(body.currency()).isEqualTo("usd");
        assertThat(body.estimatedBillMinor()).isEqualTo(624L);
        assertThat(body.members()).isEmpty();
        assertThat(body.categoryBreakdown().api()).isEqualTo(110);
        assertThat(body.categoryBreakdown().ai()).isEqualTo(200);
        assertThat(body.categoryBreakdown().automation()).isEqualTo(2);
        assertThat(body.stripeSubscriptionId()).isEqualTo("sub_test_99");
        // Member role → ledger never queried per-user.
        verify(ledgerRepo, never()).sumPeriodAmountForMember(any(), any(), any(), any(), any());
    }

    @Test
    void getWallet_subscribedNoCap_returnsNoCapTrueAndNullLimit() {
        User user = userWithId(9L, UUID.randomUUID());
        Team team = teamWithId(11L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(9L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        when(billingService.forTeam(11L)).thenReturn(subscribedBilling("sub_nocap", null, null));
        when(entitlementService.getSnapshot(11L)).thenReturn(snapshot(50L, null));
        stubEmptyLedgerReads(11L);
        when(memberRepo.findByTeamId(11L)).thenReturn(List.of());

        ResponseEntity<WalletSnapshotResponse> resp =
                controller.getWallet(jwtAuth(user.getSupabaseId()));

        WalletSnapshotResponse body = resp.getBody();
        assertThat(body.status()).isEqualTo("subscribed");
        assertThat(body.role()).isEqualTo("leader");
        assertThat(body.capUsd()).isNull();
        assertThat(body.noCap()).isTrue();
        // Uncapped → no document ceiling to draw a bar against.
        assertThat(body.billableLimit()).isNull();
    }

    @Test
    void getWallet_leader_populatesMembers() {
        User leader = userWithId(10L, UUID.randomUUID());
        User member = userWithId(11L, UUID.randomUUID());
        member.setUsername("alice");
        member.setEmail("alice@example.com");
        Team team = teamWithId(77L);
        TeamMembership leaderRow = membership(team, leader, TeamRole.LEADER);
        TeamMembership memberRow = membership(team, member, TeamRole.MEMBER);

        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(10L)).thenReturn(List.of(leaderRow));
        when(billingService.forTeam(77L)).thenReturn(freeBilling(500L));
        when(entitlementService.getSnapshot(77L)).thenReturn(snapshot(0L, 500L));
        stubEmptyLedgerReads(77L);
        when(memberRepo.findByTeamId(77L)).thenReturn(List.of(leaderRow, memberRow));
        // Ledger returns signed (negative) debits.
        when(ledgerRepo.sumPeriodAmountForMember(eq(77L), any(), any(), any(), any()))
                .thenReturn(-42L);

        ResponseEntity<WalletSnapshotResponse> resp =
                controller.getWallet(jwtAuth(leader.getSupabaseId()));

        WalletSnapshotResponse body = resp.getBody();
        assertThat(body.role()).isEqualTo("leader");
        assertThat(body.members()).hasSize(2);
        MemberRow secondMember =
                body.members().stream()
                        .filter(m -> "alice".equals(m.name()))
                        .findFirst()
                        .orElseThrow();
        assertThat(secondMember.email()).isEqualTo("alice@example.com");
        assertThat(secondMember.spendUnits()).isEqualTo(42);
    }

    @Test
    void getWallet_anonymousIsRejected() {
        Authentication anon =
                new AnonymousAuthenticationToken(
                        "k",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

        ResponseEntity<WalletSnapshotResponse> resp = controller.getWallet(anon);

        // AuthenticationUtils.getCurrentUser throws SecurityException for "anonymousUser" since it
        // has no Supabase id and is not a User principal — the controller maps that to 401.
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(entitlementService, billingService, memberRepo, extRepo, policyRepo);
    }

    @Test
    void getWallet_authenticatedNoTeam_returnsEmptyFreeShape() {
        User user = userWithId(12L, UUID.randomUUID());
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(12L)).thenReturn(List.of());

        ResponseEntity<WalletSnapshotResponse> resp =
                controller.getWallet(jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().status()).isEqualTo("free");
        assertThat(resp.getBody().members()).isEmpty();
        // Entitlement service must not be queried for a teamless user (avoids null-key NPE).
        verifyNoInteractions(entitlementService);
    }

    // -----------------------------------------------------------------------------------------
    // PATCH /cap
    // -----------------------------------------------------------------------------------------

    @Test
    void updateCap_leaderUpdatesUnitsAndInvalidates() {
        User leader = userWithId(20L, UUID.randomUUID());
        Team team = teamWithId(33L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(20L))
                .thenReturn(List.of(membership(team, leader, TeamRole.LEADER)));
        when(policyRepo.findByTeamId(33L)).thenReturn(Optional.empty());

        ResponseEntity<Void> resp =
                controller.updateCap(
                        new UpdateCapRequest(40, false), jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        ArgumentCaptor<WalletPolicy> saved = ArgumentCaptor.forClass(WalletPolicy.class);
        verify(policyRepo).save(saved.capture());
        // Rate unknown in this test (docCapForMoney → empty) → legacy conversion fallback so
        // the cap stays enforced rather than silently lifting.
        assertThat(saved.getValue().getCapUnits()).isEqualTo(4000L); // 40 USD * 100 units/USD
        assertThat(saved.getValue().getCapSourceMoney()).isEqualTo(4000L); // 40 USD == 4000 cents
        verify(entitlementService, times(1)).invalidate(33L);
    }

    @Test
    void updateCap_withKnownRate_storesDerivedDocCap() {
        User leader = userWithId(24L, UUID.randomUUID());
        Team team = teamWithId(36L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(24L))
                .thenReturn(List.of(membership(team, leader, TeamRole.LEADER)));
        when(policyRepo.findByTeamId(36L)).thenReturn(Optional.empty());
        TeamBillingContext billing = subscribedBilling("sub_36", null, null);
        when(billingService.forTeam(36L)).thenReturn(billing);
        // $28 cap at $0.02/doc → 1400 paid documents/month (the grant is a separate pool).
        when(billingService.docCapForMoney(billing, 2800L)).thenReturn(Optional.of(1400L));

        ResponseEntity<Void> resp =
                controller.updateCap(
                        new UpdateCapRequest(28, false), jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        ArgumentCaptor<WalletPolicy> saved = ArgumentCaptor.forClass(WalletPolicy.class);
        verify(policyRepo).save(saved.capture());
        assertThat(saved.getValue().getCapSourceMoney()).isEqualTo(2800L);
        assertThat(saved.getValue().getCapUnits()).isEqualTo(1400L);
        verify(entitlementService).invalidate(36L);
    }

    @Test
    void updateCap_noCapTrue_clearsCapUnits() {
        User leader = userWithId(21L, UUID.randomUUID());
        Team team = teamWithId(34L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(21L))
                .thenReturn(List.of(membership(team, leader, TeamRole.LEADER)));
        WalletPolicy existing = new WalletPolicy();
        existing.setTeamId(34L);
        existing.setCapUnits(1000L);
        existing.setCapSourceMoney(1000L);
        when(policyRepo.findByTeamId(34L)).thenReturn(Optional.of(existing));

        ResponseEntity<Void> resp =
                controller.updateCap(
                        new UpdateCapRequest(0, true), jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        ArgumentCaptor<WalletPolicy> saved = ArgumentCaptor.forClass(WalletPolicy.class);
        verify(policyRepo).save(saved.capture());
        assertThat(saved.getValue().getCapUnits()).isNull();
        assertThat(saved.getValue().getCapSourceMoney()).isNull();
        verify(entitlementService).invalidate(34L);
    }

    @Test
    void updateCap_memberIsForbidden() {
        User member = userWithId(22L, UUID.randomUUID());
        Team team = teamWithId(35L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(member));
        when(memberRepo.findPrimaryMembership(22L))
                .thenReturn(List.of(membership(team, member, TeamRole.MEMBER)));

        ResponseEntity<Void> resp =
                controller.updateCap(
                        new UpdateCapRequest(50, false), jwtAuth(member.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(policyRepo, never()).save(any());
        verify(entitlementService, never()).invalidate(any());
    }

    @Test
    void updateCap_noTeam_isForbidden() {
        User user = userWithId(23L, UUID.randomUUID());
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(23L)).thenReturn(List.of());

        ResponseEntity<Void> resp =
                controller.updateCap(
                        new UpdateCapRequest(10, false), jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(policyRepo, never()).save(any());
    }

    @Test
    void updateCap_anonymousIs401() {
        Authentication anon =
                new AnonymousAuthenticationToken(
                        "k",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

        ResponseEntity<Void> resp = controller.updateCap(new UpdateCapRequest(10, false), anon);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(policyRepo, entitlementService);
    }

    // -----------------------------------------------------------------------------------------
    // Fixtures
    // -----------------------------------------------------------------------------------------

    private static User userWithId(Long id, UUID supabaseId) {
        User u = new User();
        u.setId(id);
        u.setSupabaseId(supabaseId);
        return u;
    }

    private static Team teamWithId(Long id) {
        Team t = new Team();
        t.setId(id);
        t.setName("t-" + id);
        return t;
    }

    private static TeamMembership membership(Team team, User user, TeamRole role) {
        TeamMembership m = new TeamMembership();
        m.setTeam(team);
        m.setUser(user);
        m.setRole(role);
        return m;
    }

    private static EntitlementSnapshot snapshot(long spend, Long cap) {
        LocalDateTime start = LocalDate.now().withDayOfMonth(1).atStartOfDay();
        LocalDateTime end = start.plusMonths(1);
        return new EntitlementSnapshot(
                EntitlementState.FULL,
                FeatureSet.FULL,
                List.of(
                        FeatureGate.OFFSITE_PROCESSING,
                        FeatureGate.AUTOMATION,
                        FeatureGate.AI_SUPPORT,
                        FeatureGate.CLIENT_SIDE),
                spend,
                cap,
                start,
                end,
                false);
    }

    private static Authentication jwtAuth(UUID supabaseId) {
        Jwt jwt =
                Jwt.withTokenValue("token")
                        .header("alg", "RS256")
                        .claim("sub", supabaseId.toString())
                        .claim("email", "user@example.com")
                        .build();
        return new EnhancedJwtAuthenticationToken(
                jwt, List.of(), "user@example.com", supabaseId.toString());
    }
}
