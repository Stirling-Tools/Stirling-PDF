package stirling.software.saas.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.api.usage.FleetUsageStats;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamMembershipRepository;

@ExtendWith(MockitoExtension.class)
class SaasFleetUsageControllerTest {

    @Mock private UserRepository userRepository;
    @Mock private TeamMembershipRepository memberRepo;
    @Mock private PersistentAuditEventRepository auditRepository;
    @Mock private AuditConfigurationProperties auditConfig;

    private SaasFleetUsageController controller;

    @BeforeEach
    void setUp() {
        controller =
                new SaasFleetUsageController(
                        userRepository, memberRepo, auditRepository, auditConfig);
    }

    /** An Authentication whose principal is a User (AuthenticationUtils returns it directly). */
    private Authentication authFor(long userId) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(userId);
        Authentication auth = mock(Authentication.class);
        when(auth.getPrincipal()).thenReturn(user);
        return auth;
    }

    private TeamMembership memberOf(long teamId, String username) {
        // lenient: a member used only in the roster has its team.getId() stub unused, which strict
        // stubbing would otherwise flag.
        Team team = mock(Team.class);
        lenient().when(team.getId()).thenReturn(teamId);
        User u = mock(User.class);
        lenient().when(u.getUsername()).thenReturn(username);
        TeamMembership m = mock(TeamMembership.class);
        lenient().when(m.getTeam()).thenReturn(team);
        lenient().when(m.getUser()).thenReturn(u);
        return m;
    }

    @Test
    @DisplayName("figures are scoped to the caller's team members")
    void teamScopedFigures() {
        Authentication auth = authFor(1L);
        TeamMembership leader = memberOf(42L, "leader@acme.test");
        TeamMembership bob = memberOf(42L, "bob@acme.test");
        when(memberRepo.findPrimaryMembership(1L)).thenReturn(List.of(leader));
        when(memberRepo.findByTeamId(42L)).thenReturn(List.of(leader, bob));
        when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);
        when(auditRepository.countDistinctPrincipalsBySourceExcludingTypeAndPrincipalInAfter(
                        eq("WEB"), eq("UI_DATA"), anyList(), any(Instant.class)))
                .thenReturn(1L);
        when(auditRepository.countByTypeInAndSourceAndPrincipalInAndTimestampAfter(
                        anyList(), eq("WEB"), anyList(), any(Instant.class)))
                .thenReturn(88L);

        ResponseEntity<FleetUsageStats> res = controller.fleetStats(auth);
        FleetUsageStats stats = res.getBody();

        assertThat(stats).isNotNull();
        assertThat(stats.editorsDeployed()).isEqualTo(2L);
        assertThat(stats.activeThisMonth()).isEqualTo(1L);
        assertThat(stats.pdfsProcessed()).isEqualTo(88L);
        verify(auditRepository)
                .countByTypeInAndSourceAndPrincipalInAndTimestampAfter(
                        eq(List.of("PDF_PROCESS", "FILE_OPERATION")),
                        eq("WEB"),
                        eq(List.of("leader@acme.test", "bob@acme.test")),
                        any(Instant.class));
    }

    @Test
    @DisplayName("audit-derived figures are null when auditing is below STANDARD")
    void auditOffYieldsNulls() {
        Authentication auth = authFor(1L);
        TeamMembership leader = memberOf(42L, "leader@acme.test");
        when(memberRepo.findPrimaryMembership(1L)).thenReturn(List.of(leader));
        when(memberRepo.findByTeamId(42L)).thenReturn(List.of(leader));
        when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(false);

        FleetUsageStats stats = controller.fleetStats(auth).getBody();

        assertThat(stats).isNotNull();
        assertThat(stats.editorsDeployed()).isEqualTo(1L);
        assertThat(stats.activeThisMonth()).isNull();
        assertThat(stats.pdfsProcessed()).isNull();
        verify(auditRepository, never())
                .countByTypeInAndSourceAndPrincipalInAndTimestampAfter(
                        anyList(), any(), anyList(), any(Instant.class));
    }

    @Test
    @DisplayName("active is clamped to deployed (a subset)")
    void activeClampedToDeployed() {
        Authentication auth = authFor(1L);
        TeamMembership leader = memberOf(42L, "leader@acme.test");
        when(memberRepo.findPrimaryMembership(1L)).thenReturn(List.of(leader));
        when(memberRepo.findByTeamId(42L)).thenReturn(List.of(leader));
        when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);
        when(auditRepository.countDistinctPrincipalsBySourceExcludingTypeAndPrincipalInAfter(
                        eq("WEB"), eq("UI_DATA"), anyList(), any(Instant.class)))
                .thenReturn(5L);
        when(auditRepository.countByTypeInAndSourceAndPrincipalInAndTimestampAfter(
                        anyList(), eq("WEB"), anyList(), any(Instant.class)))
                .thenReturn(10L);

        FleetUsageStats stats = controller.fleetStats(auth).getBody();

        assertThat(stats).isNotNull();
        assertThat(stats.activeThisMonth()).isEqualTo(1L);
    }

    @Test
    @DisplayName("a caller with no team gets an empty fleet, not a 500")
    void noTeamReturnsEmpty() {
        Authentication auth = authFor(1L);
        when(memberRepo.findPrimaryMembership(1L)).thenReturn(List.of());

        FleetUsageStats stats = controller.fleetStats(auth).getBody();

        assertThat(stats).isNotNull();
        assertThat(stats.editorsDeployed()).isEqualTo(0L);
        assertThat(stats.activeThisMonth()).isNull();
        assertThat(stats.pdfsProcessed()).isNull();
    }

    @Test
    @DisplayName("an unauthenticated request is 401")
    void unauthenticatedIs401() {
        ResponseEntity<FleetUsageStats> res = controller.fleetStats(null);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
