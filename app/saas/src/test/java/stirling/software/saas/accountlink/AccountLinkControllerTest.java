package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.accountlink.AccountLinkController.RegisterRequest;
import stirling.software.saas.accountlink.AccountLinkController.RegisterResponse;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Pure-Mockito unit tests for {@link AccountLinkController} — the leader-only auth ladder, and that
 * the team is always derived from the caller's membership (never the request). Mirrors {@code
 * PaygInvoicesControllerTest}'s static-mock of {@link AuthenticationUtils}.
 */
@ExtendWith(MockitoExtension.class)
class AccountLinkControllerTest {

    @Mock private AccountLinkService service;
    @Mock private TeamMembershipRepository memberRepo;
    @Mock private UserRepository userRepository;

    private AccountLinkController controller;
    private Authentication auth;

    @BeforeEach
    void setUp() {
        controller = new AccountLinkController(service, memberRepo, userRepository);
        auth =
                new AnonymousAuthenticationToken(
                        "k", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    @Test
    void register_unauthenticated_returns401() {
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenThrow(new SecurityException("not authenticated"));

            ResponseEntity<RegisterResponse> resp =
                    controller.register(new RegisterRequest("host"), auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            verifyNoInteractions(service);
        }
    }

    @Test
    void register_noMembership_returns403() {
        User user = mockUser(42L);
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(user);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of());

            ResponseEntity<RegisterResponse> resp = controller.register(null, auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            verifyNoInteractions(service);
        }
    }

    @Test
    void register_nonLeader_returns403() {
        User user = mockUser(42L);
        TeamMembership member = membership(7L, TeamRole.MEMBER);
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(user);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of(member));

            ResponseEntity<RegisterResponse> resp = controller.register(null, auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            verifyNoInteractions(service);
        }
    }

    @Test
    void register_leader_mintsCredentialForCallerTeam() {
        User user = mockUser(42L);
        TeamMembership leader = membership(7L, TeamRole.LEADER);
        when(service.register(7L, 42L, "host"))
                .thenReturn(
                        new AccountLinkService.RegisteredInstance(99L, "dev-x", "sec-x", "host"));
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(user);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of(leader));

            ResponseEntity<RegisterResponse> resp =
                    controller.register(new RegisterRequest("host"), auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            RegisterResponse body = resp.getBody();
            assertThat(body).isNotNull();
            // Team comes from the caller's membership and is surfaced in the response.
            assertThat(body.teamId()).isEqualTo(7L);
            assertThat(body.instanceId()).isEqualTo(99L);
            assertThat(body.deviceSecret()).isEqualTo("sec-x");
        }
    }

    @Test
    void revoke_leader_returns204WhenServiceRevokes() {
        User user = mockUser(42L);
        TeamMembership leader = membership(7L, TeamRole.LEADER);
        when(service.revoke(7L, 11L)).thenReturn(true);
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(user);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of(leader));

            ResponseEntity<Void> resp = controller.revoke(11L, auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        }
    }

    @Test
    void revoke_leader_returns404WhenServiceReportsNotFound() {
        User user = mockUser(42L);
        TeamMembership leader = membership(7L, TeamRole.LEADER);
        when(service.revoke(7L, 11L)).thenReturn(false);
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(user);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of(leader));

            ResponseEntity<Void> resp = controller.revoke(11L, auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    private static User mockUser(long id) {
        User u = new User();
        u.setId(id);
        return u;
    }

    private static TeamMembership membership(long teamId, TeamRole role) {
        Team team = new Team();
        team.setId(teamId);
        TeamMembership tm = new TeamMembership();
        tm.setTeam(team);
        tm.setRole(role);
        return tm;
    }
}
