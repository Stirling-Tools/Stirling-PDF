package stirling.software.saas.payg.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.payg.api.PaygWalletController.PortalSessionRequest;
import stirling.software.saas.payg.api.PaygWalletController.UpdateCapRequest;
import stirling.software.saas.payg.api.PaygWalletController.UpdateSubCapRequest;
import stirling.software.saas.payg.api.WalletSnapshotResponse.MemberRow;
import stirling.software.saas.payg.entitlement.EntitlementService;
import stirling.software.saas.payg.entitlement.EntitlementSnapshot;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletCategorySummaryDao;
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

    private static final String PORTAL_ENDPOINT =
            "https://example.supabase.co/functions/v1/create-customer-portal-session";
    private static final String PORTAL_TOKEN = "service-role-test-token";
    private static final String PORTAL_ALLOWED_HOSTS = "app.example,staging.example";

    @Mock private EntitlementService entitlementService;
    @Mock private TeamMembershipRepository memberRepo;
    @Mock private PaygTeamExtensionsRepository extRepo;
    @Mock private WalletPolicyRepository policyRepo;
    @Mock private WalletLedgerRepository ledgerRepo;
    @Mock private WalletCategorySummaryDao categorySummaryDao;
    @Mock private UserRepository userRepository;
    @Mock private RestTemplate restTemplate;

    private PaygWalletController controller;

    @BeforeEach
    void setUp() {
        controller = newController(PORTAL_ENDPOINT, PORTAL_TOKEN, PORTAL_ALLOWED_HOSTS);
    }

    private PaygWalletController newController(
            String portalEndpoint, String portalToken, String allowedHosts) {
        return new PaygWalletController(
                entitlementService,
                memberRepo,
                extRepo,
                policyRepo,
                ledgerRepo,
                categorySummaryDao,
                userRepository,
                restTemplate,
                portalEndpoint,
                portalToken,
                allowedHosts);
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
        when(extRepo.findById(42L)).thenReturn(Optional.empty());
        when(policyRepo.findByTeamId(42L)).thenReturn(Optional.empty());
        when(entitlementService.getSnapshot(42L)).thenReturn(snapshot(0L, null));
        when(categorySummaryDao.sumByCategory(eq(42L), any(LocalDate.class)))
                .thenReturn(emptyCategoryMap());

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
        assertThat(body.members()).isEmpty();
        assertThat(body.recent()).isEmpty();
        assertThat(body.categoryBreakdown().api()).isZero();
        assertThat(body.categoryBreakdown().ai()).isZero();
        assertThat(body.categoryBreakdown().automation()).isZero();
    }

    @Test
    void getWallet_subscribedMember_returnsCapInUsdAndEmptyMembers() {
        User user = userWithId(8L, UUID.randomUUID());
        Team team = teamWithId(99L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(8L))
                .thenReturn(List.of(membership(team, user, TeamRole.MEMBER)));
        // stripeCustomerId present → "subscribed" (until PR #6532's payg_subscription_id lands)
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(99L);
        ext.setStripeCustomerId("cus_test_123");
        when(extRepo.findById(99L)).thenReturn(Optional.of(ext));

        WalletPolicy policy = new WalletPolicy();
        policy.setTeamId(99L);
        policy.setCapUnits(2500L); // == $25 at 100 units / $
        when(policyRepo.findByTeamId(99L)).thenReturn(Optional.of(policy));

        when(entitlementService.getSnapshot(99L)).thenReturn(snapshot(312L, 2500L));
        Map<BillingCategory, Long> byCat = emptyCategoryMap();
        byCat.put(BillingCategory.API, 110L);
        byCat.put(BillingCategory.AI, 200L);
        byCat.put(BillingCategory.AUTOMATION, 2L);
        when(categorySummaryDao.sumByCategory(eq(99L), any(LocalDate.class))).thenReturn(byCat);

        ResponseEntity<WalletSnapshotResponse> resp =
                controller.getWallet(jwtAuth(user.getSupabaseId()));

        WalletSnapshotResponse body = resp.getBody();
        assertThat(body.status()).isEqualTo("subscribed");
        assertThat(body.role()).isEqualTo("member");
        assertThat(body.capUsd()).isEqualTo(25);
        assertThat(body.noCap()).isFalse();
        assertThat(body.billableUsed()).isEqualTo(312);
        assertThat(body.spendUnitsThisPeriod()).isEqualTo(312);
        assertThat(body.members()).isEmpty();
        assertThat(body.categoryBreakdown().api()).isEqualTo(110);
        assertThat(body.categoryBreakdown().ai()).isEqualTo(200);
        assertThat(body.categoryBreakdown().automation()).isEqualTo(2);
        // stripeSubscriptionId still null until #6532 lands.
        assertThat(body.stripeSubscriptionId()).isNull();
        // Member role → ledger never queried per-user.
        verify(ledgerRepo, never()).sumPeriodAmountForMember(any(), any(), any(), any(), any());
    }

    @Test
    void getWallet_subscribedNoCap_returnsNoCapTrueAndNullCapUsd() {
        User user = userWithId(9L, UUID.randomUUID());
        Team team = teamWithId(11L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(9L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(11L);
        ext.setStripeCustomerId("cus_nocap");
        when(extRepo.findById(11L)).thenReturn(Optional.of(ext));
        WalletPolicy policy = new WalletPolicy();
        policy.setTeamId(11L);
        policy.setCapUnits(null); // explicit no-cap
        when(policyRepo.findByTeamId(11L)).thenReturn(Optional.of(policy));
        when(entitlementService.getSnapshot(11L)).thenReturn(snapshot(50L, null));
        when(categorySummaryDao.sumByCategory(eq(11L), any(LocalDate.class)))
                .thenReturn(emptyCategoryMap());
        when(memberRepo.findByTeamId(11L)).thenReturn(List.of());

        ResponseEntity<WalletSnapshotResponse> resp =
                controller.getWallet(jwtAuth(user.getSupabaseId()));

        WalletSnapshotResponse body = resp.getBody();
        assertThat(body.status()).isEqualTo("subscribed");
        assertThat(body.role()).isEqualTo("leader");
        assertThat(body.capUsd()).isNull();
        assertThat(body.noCap()).isTrue();
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
        memberRow.setCapUnits(1500L);

        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(10L)).thenReturn(List.of(leaderRow));
        when(extRepo.findById(77L)).thenReturn(Optional.empty());
        when(policyRepo.findByTeamId(77L)).thenReturn(Optional.empty());
        when(entitlementService.getSnapshot(77L)).thenReturn(snapshot(0L, null));
        when(categorySummaryDao.sumByCategory(eq(77L), any(LocalDate.class)))
                .thenReturn(emptyCategoryMap());
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
        assertThat(secondMember.capUnits()).isEqualTo(1500);
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
        verifyNoInteractions(
                entitlementService, memberRepo, extRepo, policyRepo, categorySummaryDao);
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
        assertThat(saved.getValue().getCapUnits()).isEqualTo(4000L); // 40 USD * 100 units/USD
        assertThat(saved.getValue().getCapSourceMoney()).isEqualTo(4000L); // 40 USD == 4000 cents
        verify(entitlementService, times(1)).invalidate(33L);
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
    // PATCH /sub-caps/{userId}
    // -----------------------------------------------------------------------------------------

    @Test
    void updateSubCap_leaderBelowTeamCap_savesAndReportsUnclamped() {
        User leader = userWithId(30L, UUID.randomUUID());
        User target = userWithId(31L, UUID.randomUUID());
        Team team = teamWithId(50L);
        TeamMembership leaderRow = membership(team, leader, TeamRole.LEADER);
        TeamMembership targetRow = membership(team, target, TeamRole.MEMBER);

        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(30L)).thenReturn(List.of(leaderRow));
        when(memberRepo.findByTeamIdAndUserId(50L, 31L)).thenReturn(Optional.of(targetRow));
        WalletPolicy policy = new WalletPolicy();
        policy.setTeamId(50L);
        policy.setCapUnits(5000L);
        when(policyRepo.findByTeamId(50L)).thenReturn(Optional.of(policy));

        ResponseEntity<Map<String, Object>> resp =
                controller.updateSubCap(
                        31L, new UpdateSubCapRequest(2000), jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("success")).isEqualTo(Boolean.TRUE);
        assertThat(body.get("clamped")).isEqualTo(Boolean.FALSE);
        assertThat(body.get("capUnits")).isEqualTo(2000L);

        ArgumentCaptor<TeamMembership> saved = ArgumentCaptor.forClass(TeamMembership.class);
        verify(memberRepo).save(saved.capture());
        assertThat(saved.getValue().getCapUnits()).isEqualTo(2000L);
        verify(entitlementService).invalidate(50L);
    }

    @Test
    void updateSubCap_leaderAboveTeamCap_clampsToTeamCap() {
        User leader = userWithId(32L, UUID.randomUUID());
        User target = userWithId(33L, UUID.randomUUID());
        Team team = teamWithId(51L);
        TeamMembership leaderRow = membership(team, leader, TeamRole.LEADER);
        TeamMembership targetRow = membership(team, target, TeamRole.MEMBER);

        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(32L)).thenReturn(List.of(leaderRow));
        when(memberRepo.findByTeamIdAndUserId(51L, 33L)).thenReturn(Optional.of(targetRow));
        WalletPolicy policy = new WalletPolicy();
        policy.setTeamId(51L);
        policy.setCapUnits(1000L);
        when(policyRepo.findByTeamId(51L)).thenReturn(Optional.of(policy));

        ResponseEntity<Map<String, Object>> resp =
                controller.updateSubCap(
                        33L, new UpdateSubCapRequest(9999), jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = resp.getBody();
        assertThat(body.get("success")).isEqualTo(Boolean.TRUE);
        assertThat(body.get("clamped")).isEqualTo(Boolean.TRUE);
        assertThat(body.get("capUnits")).isEqualTo(1000L);

        ArgumentCaptor<TeamMembership> saved = ArgumentCaptor.forClass(TeamMembership.class);
        verify(memberRepo).save(saved.capture());
        assertThat(saved.getValue().getCapUnits()).isEqualTo(1000L);
        verify(entitlementService).invalidate(51L);
    }

    @Test
    void updateSubCap_nullCapUnits_clearsSubCap() {
        User leader = userWithId(34L, UUID.randomUUID());
        User target = userWithId(35L, UUID.randomUUID());
        Team team = teamWithId(52L);
        TeamMembership leaderRow = membership(team, leader, TeamRole.LEADER);
        TeamMembership targetRow = membership(team, target, TeamRole.MEMBER);
        targetRow.setCapUnits(500L); // had a sub-cap before

        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(34L)).thenReturn(List.of(leaderRow));
        when(memberRepo.findByTeamIdAndUserId(52L, 35L)).thenReturn(Optional.of(targetRow));
        WalletPolicy policy = new WalletPolicy();
        policy.setTeamId(52L);
        policy.setCapUnits(5000L);
        when(policyRepo.findByTeamId(52L)).thenReturn(Optional.of(policy));

        ResponseEntity<Map<String, Object>> resp =
                controller.updateSubCap(
                        35L, new UpdateSubCapRequest(null), jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = resp.getBody();
        assertThat(body.get("clamped")).isEqualTo(Boolean.FALSE);
        assertThat(body.get("capUnits")).isNull();

        ArgumentCaptor<TeamMembership> saved = ArgumentCaptor.forClass(TeamMembership.class);
        verify(memberRepo).save(saved.capture());
        assertThat(saved.getValue().getCapUnits()).isNull();
        verify(entitlementService).invalidate(52L);
    }

    @Test
    void updateSubCap_teamHasNoCap_neverClamps() {
        // Subscribed no-cap team: wallet_policy.cap_units == null → any sub-cap is accepted as-is.
        User leader = userWithId(36L, UUID.randomUUID());
        User target = userWithId(37L, UUID.randomUUID());
        Team team = teamWithId(53L);
        TeamMembership leaderRow = membership(team, leader, TeamRole.LEADER);
        TeamMembership targetRow = membership(team, target, TeamRole.MEMBER);

        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(36L)).thenReturn(List.of(leaderRow));
        when(memberRepo.findByTeamIdAndUserId(53L, 37L)).thenReturn(Optional.of(targetRow));
        WalletPolicy policy = new WalletPolicy();
        policy.setTeamId(53L);
        policy.setCapUnits(null); // no team cap
        when(policyRepo.findByTeamId(53L)).thenReturn(Optional.of(policy));

        ResponseEntity<Map<String, Object>> resp =
                controller.updateSubCap(
                        37L, new UpdateSubCapRequest(1_000_000), jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().get("clamped")).isEqualTo(Boolean.FALSE);
        assertThat(resp.getBody().get("capUnits")).isEqualTo(1_000_000L);
    }

    @Test
    void updateSubCap_memberIsForbidden() {
        User member = userWithId(38L, UUID.randomUUID());
        Team team = teamWithId(54L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(member));
        when(memberRepo.findPrimaryMembership(38L))
                .thenReturn(List.of(membership(team, member, TeamRole.MEMBER)));

        ResponseEntity<Map<String, Object>> resp =
                controller.updateSubCap(
                        99L, new UpdateSubCapRequest(100), jwtAuth(member.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(memberRepo, never()).save(any());
        verify(entitlementService, never()).invalidate(any());
    }

    @Test
    void updateSubCap_targetInDifferentTeam_returns404() {
        User leader = userWithId(40L, UUID.randomUUID());
        Team team = teamWithId(55L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(leader));
        when(memberRepo.findPrimaryMembership(40L))
                .thenReturn(List.of(membership(team, leader, TeamRole.LEADER)));
        // Target user 41 is not a member of team 55.
        when(memberRepo.findByTeamIdAndUserId(55L, 41L)).thenReturn(Optional.empty());

        ResponseEntity<Map<String, Object>> resp =
                controller.updateSubCap(
                        41L, new UpdateSubCapRequest(500), jwtAuth(leader.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(memberRepo, never()).save(any());
        verify(entitlementService, never()).invalidate(any());
    }

    @Test
    void updateSubCap_noTeam_isForbidden() {
        User user = userWithId(42L, UUID.randomUUID());
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of());

        ResponseEntity<Map<String, Object>> resp =
                controller.updateSubCap(
                        99L, new UpdateSubCapRequest(100), jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verify(memberRepo, never()).save(any());
    }

    @Test
    void updateSubCap_anonymousIs401() {
        Authentication anon =
                new AnonymousAuthenticationToken(
                        "k",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

        ResponseEntity<Map<String, Object>> resp =
                controller.updateSubCap(99L, new UpdateSubCapRequest(100), anon);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(memberRepo, policyRepo, entitlementService);
    }

    // -----------------------------------------------------------------------------------------
    // POST /portal-session
    // -----------------------------------------------------------------------------------------

    @Test
    void portalSession_subscribedTeam_returnsUrlAndCallsEdgeFnWithBearer() {
        User user = userWithId(60L, UUID.randomUUID());
        Team team = teamWithId(80L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(60L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(80L);
        ext.setStripeCustomerId("cus_subscribed");
        when(extRepo.findById(80L)).thenReturn(Optional.of(ext));

        when(restTemplate.exchange(
                        eq(PORTAL_ENDPOINT),
                        eq(HttpMethod.POST),
                        any(HttpEntity.class),
                        eq(Map.class)))
                .thenReturn(
                        ResponseEntity.ok(
                                (Map)
                                        Map.of(
                                                "success",
                                                true,
                                                "url",
                                                "https://billing.stripe.com/p/session/xyz")));

        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(
                        new PortalSessionRequest("https://app.example/return"),
                        jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().get("url")).isEqualTo("https://billing.stripe.com/p/session/xyz");

        @SuppressWarnings("rawtypes")
        ArgumentCaptor<HttpEntity> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate)
                .exchange(
                        eq(PORTAL_ENDPOINT), eq(HttpMethod.POST), captor.capture(), eq(Map.class));
        HttpEntity<?> sent = captor.getValue();
        // Bearer service-role header forwarded so the edge fn can authorise.
        assertThat(sent.getHeaders().getFirst("Authorization")).isEqualTo("Bearer " + PORTAL_TOKEN);
        // Body carries team_id (string) + the optional return_url.
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) sent.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("team_id")).isEqualTo("80");
        assertThat(body.get("return_url")).isEqualTo("https://app.example/return");
    }

    @Test
    void portalSession_teamWithoutStripeCustomer_returns404() {
        User user = userWithId(61L, UUID.randomUUID());
        Team team = teamWithId(81L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(61L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        // No PaygTeamExtensions row at all → unsubscribed.
        when(extRepo.findById(81L)).thenReturn(Optional.empty());

        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(
                        new PortalSessionRequest(null), jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().get("error")).isEqualTo("TEAM_NOT_SUBSCRIBED");
        verifyNoInteractions(restTemplate);
    }

    @Test
    void portalSession_edgeFnReturnsSuccessFalse_returns502() {
        User user = userWithId(62L, UUID.randomUUID());
        Team team = teamWithId(82L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(62L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(82L);
        ext.setStripeCustomerId("cus_sad");
        when(extRepo.findById(82L)).thenReturn(Optional.of(ext));

        when(restTemplate.exchange(
                        eq(PORTAL_ENDPOINT),
                        eq(HttpMethod.POST),
                        any(HttpEntity.class),
                        eq(Map.class)))
                .thenReturn(
                        ResponseEntity.ok((Map) Map.of("success", false, "error", "stripe_down")));

        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(
                        new PortalSessionRequest(null), jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().get("error")).isEqualTo("PORTAL_UNAVAILABLE");
    }

    @Test
    void portalSession_edgeFnThrows_returns502() {
        User user = userWithId(63L, UUID.randomUUID());
        Team team = teamWithId(83L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(63L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(83L);
        ext.setStripeCustomerId("cus_throw");
        when(extRepo.findById(83L)).thenReturn(Optional.of(ext));

        when(restTemplate.exchange(
                        eq(PORTAL_ENDPOINT),
                        eq(HttpMethod.POST),
                        any(HttpEntity.class),
                        eq(Map.class)))
                .thenThrow(new ResourceAccessException("connect timeout"));

        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(
                        new PortalSessionRequest(null), jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().get("error")).isEqualTo("PORTAL_UNAVAILABLE");
    }

    @Test
    void portalSession_endpointBlank_returns503() {
        // Rebuild controller with blank endpoint to simulate local dev / unconfigured env.
        controller = newController("", PORTAL_TOKEN, PORTAL_ALLOWED_HOSTS);

        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(
                        new PortalSessionRequest(null), jwtAuth(UUID.randomUUID()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().get("error")).isEqualTo("PORTAL_NOT_CONFIGURED");
        // Should short-circuit before resolving the user or hitting downstream.
        verifyNoInteractions(userRepository, memberRepo, extRepo, restTemplate);
    }

    @Test
    void portalSession_returnUrlNotOnAllowlist_returns400() {
        // No DB / RestTemplate stubbing — rejection happens before the controller resolves the
        // user, so none of those collaborators should be touched.
        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(
                        new PortalSessionRequest("https://evil.example/billing-return"),
                        jwtAuth(UUID.randomUUID()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().get("error")).isEqualTo("INVALID_RETURN_URL");
        verifyNoInteractions(userRepository, memberRepo, extRepo, restTemplate);
    }

    @Test
    void portalSession_returnUrlMalformed_returns400() {
        // Non-http(s) scheme should be rejected before any DB / HTTP work.
        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(
                        new PortalSessionRequest("javascript:alert(1)"),
                        jwtAuth(UUID.randomUUID()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody().get("error")).isEqualTo("INVALID_RETURN_URL");
        verifyNoInteractions(userRepository, memberRepo, extRepo, restTemplate);
    }

    @Test
    void portalSession_returnUrlEmpty_allowlistNotChecked() {
        // returnUrl == null / blank → no allowlist enforcement; the edge fn falls back to its
        // configured default. Use a controller with an EMPTY allowlist to prove the path bypasses
        // it: with the empty allowlist any non-null URL would be rejected, but null sails through.
        controller = newController(PORTAL_ENDPOINT, PORTAL_TOKEN, "");

        User user = userWithId(64L, UUID.randomUUID());
        Team team = teamWithId(84L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(64L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(84L);
        ext.setStripeCustomerId("cus_blank");
        when(extRepo.findById(84L)).thenReturn(Optional.of(ext));
        when(restTemplate.exchange(
                        eq(PORTAL_ENDPOINT),
                        eq(HttpMethod.POST),
                        any(HttpEntity.class),
                        eq(Map.class)))
                .thenReturn(
                        ResponseEntity.ok(
                                (Map)
                                        Map.of(
                                                "success",
                                                true,
                                                "url",
                                                "https://billing.stripe.com/p/session/abc")));

        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(
                        new PortalSessionRequest(null), jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        // The forwarded body must NOT carry return_url when caller didn't supply one.
        @SuppressWarnings("rawtypes")
        ArgumentCaptor<HttpEntity> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate)
                .exchange(
                        eq(PORTAL_ENDPOINT), eq(HttpMethod.POST), captor.capture(), eq(Map.class));
        @SuppressWarnings("unchecked")
        Map<String, Object> sentBody = (Map<String, Object>) captor.getValue().getBody();
        assertThat(sentBody).doesNotContainKey("return_url");
        assertThat(sentBody.get("team_id")).isEqualTo("84");
    }

    @Test
    void portalSession_nullBody_isAllowed() {
        // FE may POST with no body at all — Spring binds @RequestBody(required = false) to null,
        // and the controller treats that the same as a body with returnUrl=null.
        User user = userWithId(65L, UUID.randomUUID());
        Team team = teamWithId(85L);
        when(userRepository.findBySupabaseId(any())).thenReturn(Optional.of(user));
        when(memberRepo.findPrimaryMembership(65L))
                .thenReturn(List.of(membership(team, user, TeamRole.LEADER)));
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(85L);
        ext.setStripeCustomerId("cus_nullbody");
        when(extRepo.findById(85L)).thenReturn(Optional.of(ext));
        when(restTemplate.exchange(
                        eq(PORTAL_ENDPOINT),
                        eq(HttpMethod.POST),
                        any(HttpEntity.class),
                        eq(Map.class)))
                .thenReturn(
                        ResponseEntity.ok(
                                (Map)
                                        Map.of(
                                                "success",
                                                true,
                                                "url",
                                                "https://billing.stripe.com/p/session/null")));

        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(null, jwtAuth(user.getSupabaseId()));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void portalSession_anonymous_returns401() {
        Authentication anon =
                new AnonymousAuthenticationToken(
                        "k",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

        ResponseEntity<Map<String, Object>> resp =
                controller.createPortalSession(new PortalSessionRequest(null), anon);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(restTemplate, extRepo, memberRepo);
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
                end);
    }

    private static Map<BillingCategory, Long> emptyCategoryMap() {
        EnumMap<BillingCategory, Long> m = new EnumMap<>(BillingCategory.class);
        for (BillingCategory c : BillingCategory.values()) {
            m.put(c, 0L);
        }
        return m;
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
