package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.security.UserTeamResolver;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Leader-only key management, team taken from the caller; redeem answers alike for every refusal.
 */
@ExtendWith(MockitoExtension.class)
class LinkKeyControllerTest {

    @Mock private LinkKeyService service;
    @Mock private TeamMembershipRepository memberRepo;
    @Mock private UserRepository userRepository;
    @Mock private RateLimitStore rateLimits;

    private final MockHttpServletRequest http = new MockHttpServletRequest();
    private LinkKeyController controller;
    private Authentication auth;

    @BeforeEach
    void setUp() {
        controller =
                new LinkKeyController(
                        service,
                        new LeaderTeamResolver(new UserTeamResolver(memberRepo), userRepository),
                        rateLimits);
        http.setRemoteAddr("203.0.113.9");
        auth =
                new AnonymousAuthenticationToken(
                        "k", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    @Test
    void create_unauthenticated_returns401() {
        try (MockedStatic<AuthenticationUtils> mocked =
                Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenThrow(new SecurityException("not authenticated"));

            assertThat(
                            controller
                                    .create(new LinkKeyController.CreateRequest("x"), auth)
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
            verifyNoInteractions(service);
        }
    }

    @Test
    void create_member_returns403() {
        try (MockedStatic<AuthenticationUtils> mocked = signedIn(TeamRole.MEMBER)) {
            assertThat(
                            controller
                                    .create(new LinkKeyController.CreateRequest("x"), auth)
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(controller.list(auth).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(controller.revoke("k1", auth).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
            verifyNoInteractions(service);
        }
    }

    @Test
    void create_leader_issuesForTheCallersTeamAndUser() {
        LinkKeyService.CreatedKey created =
                new LinkKeyService.CreatedKey("k1", "stlk_k1.s", "Prod", LocalDateTime.now());
        when(service.create(7L, 42L, "Prod")).thenReturn(created);
        try (MockedStatic<AuthenticationUtils> mocked = signedIn(TeamRole.LEADER)) {
            ResponseEntity<?> resp =
                    controller.create(new LinkKeyController.CreateRequest("Prod"), auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            assertThat(resp.getBody()).isEqualTo(created);
        }
    }

    @Test
    void list_leader_returnsOnlyTheCallersUsableKeysWithoutSecrets() {
        LinkKey key = new LinkKey();
        key.setKeyId("k1");
        key.setName("Prod");
        key.setExpiresAt(LocalDateTime.now().plusDays(3));
        when(service.listUsable(7L)).thenReturn(List.of(key));
        try (MockedStatic<AuthenticationUtils> mocked = signedIn(TeamRole.LEADER)) {
            ResponseEntity<List<LinkKeyController.KeyRow>> resp = controller.list(auth);

            assertThat(resp.getBody())
                    .singleElement()
                    .satisfies(
                            row -> {
                                assertThat(row.keyId()).isEqualTo("k1");
                                assertThat(row.name()).isEqualTo("Prod");
                            });
            verify(service).listUsable(7L);
        }
    }

    @Test
    void revoke_leader_scopesToTheCallersTeam() {
        when(service.revoke(7L, "k1")).thenReturn(true);
        when(service.revoke(7L, "k2")).thenReturn(false);
        try (MockedStatic<AuthenticationUtils> mocked = signedIn(TeamRole.LEADER)) {
            assertThat(controller.revoke("k1", auth).getStatusCode())
                    .isEqualTo(HttpStatus.NO_CONTENT);
            assertThat(controller.revoke("k2", auth).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Test
    void redeem_isLimitedPerSourceAddressBeforeTheKeyIsLookedAt() {
        when(rateLimits.tryConsume(
                        "account-link:redeem:203.0.113.9",
                        LinkKeyController.REDEEMS_PER_HOUR,
                        Duration.ofHours(1)))
                .thenReturn(new RateLimitDecision(false, 0, 1));

        ResponseEntity<?> resp =
                controller.redeem(new LinkKeyController.RedeemRequest("stlk_k.s", null), http);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        verifyNoInteractions(service);
    }

    @Test
    void redeem_returnsTheCredential() {
        allowRedeem();
        when(service.redeem("stlk_k.s", "host"))
                .thenReturn(Optional.of(new LinkKeyService.Redeemed("dev", "sec", 7L)));

        ResponseEntity<?> resp =
                controller.redeem(new LinkKeyController.RedeemRequest("stlk_k.s", "host"), http);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody())
                .isEqualTo(new LinkKeyController.RedeemResponse("dev", "sec", 7L));
    }

    @Test
    void redeem_refusalsAllLookTheSame() {
        allowRedeem();
        when(service.redeem("stlk_k.s", null)).thenReturn(Optional.empty());

        ResponseEntity<?> refused =
                controller.redeem(new LinkKeyController.RedeemRequest("stlk_k.s", null), http);
        ResponseEntity<?> missing = controller.redeem(null, http);

        assertThat(refused.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(refused.getBody()).isEqualTo(Map.of("error", "KEY_REJECTED"));
        assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(missing.getBody()).isEqualTo(Map.of("error", "KEY_REJECTED"));
    }

    private void allowRedeem() {
        when(rateLimits.tryConsume(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyLong(),
                        org.mockito.ArgumentMatchers.any()))
                .thenReturn(new RateLimitDecision(true, 19, 0));
    }

    /** Signs in user 42 on team 7 with the given role; close the returned mock. */
    private MockedStatic<AuthenticationUtils> signedIn(TeamRole role) {
        User user = new User();
        user.setId(42L);
        Team team = new Team();
        team.setId(7L);
        TeamMembership membership = new TeamMembership();
        membership.setTeam(team);
        membership.setRole(role);
        user.setTeam(team);
        when(memberRepo.findByTeamIdAndUserId(7L, 42L)).thenReturn(Optional.of(membership));
        MockedStatic<AuthenticationUtils> mocked = Mockito.mockStatic(AuthenticationUtils.class);
        mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                .thenReturn(user);
        return mocked;
    }
}
