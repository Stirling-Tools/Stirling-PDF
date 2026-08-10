package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * The pairing surface's auth boundary: {@code /start} and {@code /poll} are open to an instance
 * with no account, while lookup, approve and deny are authenticated and leader-only. Mirrors {@link
 * AccountLinkControllerTest}'s static mock of {@link AuthenticationUtils} and runs the real {@link
 * LeaderTeamResolver} over mocked repositories.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PairingControllerTest {

    private static final String VERIFY_URI = "https://stirling.example/link";

    @Mock private PairingService service;
    @Mock private TeamMembershipRepository memberRepo;
    @Mock private UserRepository userRepository;

    private PairingController controller;
    private Authentication auth;
    private User caller;

    @BeforeEach
    void setUp() {
        // Built here, never inside a when(...) argument: stubbing a mock while another stubbing
        // is still open trips Mockito's unfinished-stubbing check.
        caller = mockUser(42L);
        controller =
                new PairingController(
                        service, new LeaderTeamResolver(memberRepo, userRepository), VERIFY_URI);
        auth =
                new AnonymousAuthenticationToken(
                        "k", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    // ---------------------------------------------------------------------------------------
    // Instance side: no account, so no authentication
    // ---------------------------------------------------------------------------------------

    @Test
    void start_returnsTheDisplayCodeAndTheVerificationUri() {
        when(service.start(anyString(), anyString(), anyString()))
                .thenReturn(
                        new PairingService.StartResult(
                                "WXYZ4821", "device-code", LocalDateTime.now().plusMinutes(10), 5));

        ResponseEntity<PairingController.StartResponse> resp =
                controller.start(
                        new PairingController.StartRequest("pdf-prod-01", "1.4.2"),
                        request("203.0.113.44", null));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        PairingController.StartResponse body = resp.getBody();
        assertThat(body).isNotNull();
        // Grouped for reading aloud, which is the only thing this value is for.
        assertThat(body.userCode()).isEqualTo("WXYZ-4821");
        assertThat(body.deviceCode()).isEqualTo("device-code");
        assertThat(body.verificationUri()).isEqualTo(VERIFY_URI);
        assertThat(body.expiresInSeconds()).isPositive();
    }

    @Test
    void start_prefersTheForwardedAddressOverTheSocketPeer() {
        when(service.start(any(), any(), anyString()))
                .thenReturn(
                        new PairingService.StartResult(
                                "AAAA2222", "d", LocalDateTime.now().plusMinutes(10), 5));

        controller.start(null, request("10.0.0.1", "203.0.113.44, 70.41.3.18"));

        org.mockito.ArgumentCaptor<String> ip = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(service).start(any(), any(), ip.capture());
        assertThat(ip.getValue()).isEqualTo("203.0.113.44");
    }

    @Test
    void start_mapsTheRateLimitTo429() {
        when(service.start(any(), any(), any()))
                .thenThrow(new PairingService.TooManyRequestsException());

        assertThat(controller.start(null, request("10.0.0.1", null)).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void poll_carriesTheCredentialOnlyOnApproval() {
        when(service.poll("device-code"))
                .thenReturn(
                        new PairingService.PollResult(
                                PairingService.PollOutcome.APPROVED,
                                new AccountLinkService.RegisteredInstance(
                                        1L, "dev-1", "sec-1", "pdf-prod-01"),
                                7L));

        PairingController.PollResponse body =
                controller.poll(new PairingController.PollRequest("device-code")).getBody();

        assertThat(body).isNotNull();
        assertThat(body.status()).isEqualTo("approved");
        assertThat(body.deviceSecret()).isEqualTo("sec-1");
        assertThat(body.teamId()).isEqualTo(7L);
    }

    @Test
    void poll_nonApprovedOutcomesCarryNoSecretAndStill200() {
        for (PairingService.PollOutcome outcome :
                List.of(
                        PairingService.PollOutcome.PENDING,
                        PairingService.PollOutcome.SLOW_DOWN,
                        PairingService.PollOutcome.DENIED,
                        PairingService.PollOutcome.EXPIRED,
                        PairingService.PollOutcome.UNKNOWN)) {
            when(service.poll(any())).thenReturn(PairingService.PollResult.of(outcome));

            ResponseEntity<PairingController.PollResponse> resp =
                    controller.poll(new PairingController.PollRequest("d"));

            // A routine "still waiting" is not an error, so it must not be a 4xx.
            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isNotNull();
            assertThat(resp.getBody().status()).isEqualTo(outcome.name().toLowerCase());
            assertThat(resp.getBody().deviceSecret()).isNull();
            assertThat(resp.getBody().deviceId()).isNull();
        }
    }

    @Test
    void poll_toleratesAnEmptyBody() {
        when(service.poll(null))
                .thenReturn(PairingService.PollResult.of(PairingService.PollOutcome.UNKNOWN));

        assertThat(controller.poll(null).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // ---------------------------------------------------------------------------------------
    // Admin side: the leader ladder
    // ---------------------------------------------------------------------------------------

    @Test
    void lookup_unauthenticated_returns401() {
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenThrow(new SecurityException("not authenticated"));

            assertThat(controller.lookup("WXYZ-4821", auth).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
            verifyNoInteractions(service);
        }
    }

    @Test
    void lookup_nonLeader_returns403() {
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(caller);
            when(memberRepo.findPrimaryMembership(42L))
                    .thenReturn(List.of(membership(9L, TeamRole.MEMBER)));

            assertThat(controller.lookup("WXYZ-4821", auth).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
            verifyNoInteractions(service);
        }
    }

    @Test
    void lookup_leader_returnsTheFactsAnApproverChecks() {
        when(service.lookup("WXYZ-4821"))
                .thenReturn(
                        Optional.of(
                                new PairingService.PendingView(
                                        "WXYZ4821",
                                        "pdf-prod-01",
                                        "1.4.2",
                                        "203.0.113.44",
                                        LocalDateTime.now(),
                                        LocalDateTime.now().plusMinutes(9))));

        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            asLeader(mocked);

            PairingController.PendingResponse body = controller.lookup("WXYZ-4821", auth).getBody();

            assertThat(body).isNotNull();
            assertThat(body.name()).isEqualTo("pdf-prod-01");
            assertThat(body.address()).isEqualTo("203.0.113.44");
            assertThat(body.version()).isEqualTo("1.4.2");
            assertThat(body.userCode()).isEqualTo("WXYZ-4821");
        }
    }

    @Test
    void lookup_unknownCode_returns404() {
        when(service.lookup(anyString())).thenReturn(Optional.empty());
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            asLeader(mocked);

            assertThat(controller.lookup("NOPE", auth).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Test
    void approve_usesTheCallersTeamNeverTheRequestBody() {
        when(service.approve(anyString(), anyLong(), anyLong(), any())).thenReturn(true);
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            asLeader(mocked);

            ResponseEntity<Void> resp =
                    controller.approve(
                            new PairingController.ApproveRequest("WXYZ-4821", "renamed"), auth);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
            // The team comes from the resolved membership (11), so a body cannot target another.
            org.mockito.Mockito.verify(service).approve("WXYZ-4821", 11L, 42L, "renamed");
        }
    }

    @Test
    void approve_nonLeader_returns403AndTouchesNothing() {
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenReturn(caller);
            when(memberRepo.findPrimaryMembership(42L)).thenReturn(List.of());

            assertThat(
                            controller
                                    .approve(
                                            new PairingController.ApproveRequest("WXYZ-4821", null),
                                            auth)
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
            verifyNoInteractions(service);
        }
    }

    @Test
    void approve_unknownCode_returns404() {
        when(service.approve(anyString(), anyLong(), anyLong(), any())).thenReturn(false);
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            asLeader(mocked);

            assertThat(
                            controller
                                    .approve(
                                            new PairingController.ApproveRequest("NOPE", null),
                                            auth)
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Test
    void deny_leaderOnly() {
        when(service.deny(anyString())).thenReturn(true);
        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            asLeader(mocked);
            assertThat(
                            controller
                                    .deny(new PairingController.CodeRequest("WXYZ-4821"), auth)
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.NO_CONTENT);
        }

        try (var mocked = org.mockito.Mockito.mockStatic(AuthenticationUtils.class)) {
            mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .thenThrow(new SecurityException("no"));
            assertThat(
                            controller
                                    .deny(new PairingController.CodeRequest("WXYZ-4821"), auth)
                                    .getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    // ---------------------------------------------------------------------------------------

    private void asLeader(org.mockito.MockedStatic<AuthenticationUtils> mocked) {
        mocked.when(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                .thenReturn(caller);
        when(memberRepo.findPrimaryMembership(42L))
                .thenReturn(List.of(membership(11L, TeamRole.LEADER)));
    }

    private static User mockUser(Long id) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        return user;
    }

    private static TeamMembership membership(Long teamId, TeamRole role) {
        Team team = new Team();
        team.setId(teamId);
        TeamMembership membership = new TeamMembership();
        membership.setTeam(team);
        membership.setRole(role);
        return membership;
    }

    private static HttpServletRequest request(String remoteAddr, String forwarded) {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getRemoteAddr()).thenReturn(remoteAddr);
        when(req.getHeader("X-Forwarded-For")).thenReturn(forwarded);
        return req;
    }
}
