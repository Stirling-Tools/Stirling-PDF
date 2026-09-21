package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.Authentication;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.saas.accountlink.ConnectController.CreateBody;
import stirling.software.saas.accountlink.ConnectController.CreateResponse;
import stirling.software.saas.accountlink.LeaderTeamResolver.LeaderTeam;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConnectControllerTest {

    private static final CreateBody BODY =
            new CreateBody("prod-1", "https://pdf.example.com/account-link/callback", "n", "s");

    @Mock private ConnectRequestService service;
    @Mock private LeaderTeamResolver leaderTeams;
    @Mock private AccountLinkService accountLinkService;
    @Mock private Authentication auth;

    private ApplicationProperties applicationProperties;
    private ConnectController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        controller =
                new ConnectController(
                        service, leaderTeams, accountLinkService, applicationProperties);
        when(service.create(anyString(), anyString(), anyString(), anyString(), any()))
                .thenReturn(ConnectRequestService.CreateResult.ok("req-1", 1800));
    }

    private String authorizeUrl(MockHttpServletRequest request) {
        Object body = controller.request(BODY, request).getBody();
        assertThat(body).isInstanceOf(CreateResponse.class);
        return ((CreateResponse) body).authorizeUrl();
    }

    private static MockHttpServletRequest request(String scheme, String host, int port) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setScheme(scheme);
        request.setServerName(host);
        request.setServerPort(port);
        return request;
    }

    @Test
    void prefersTheConfiguredFrontendUrl() {
        applicationProperties.getSystem().setFrontendUrl("https://app.example.com/app/");

        // Trailing slash trimmed, base path kept, and the API's own origin ignored.
        assertThat(authorizeUrl(request("https", "api.example.com", 443)))
                .isEqualTo("https://app.example.com/app/link?request=req-1");
    }

    @Test
    void fallsBackToTheOriginTheApiWasReachedOn() {
        assertThat(authorizeUrl(request("https", "api.example.com", 443)))
                .isEqualTo("https://api.example.com/link?request=req-1");
    }

    @Test
    void keepsANonDefaultPortAndTheContextPath() {
        MockHttpServletRequest request = request("http", "localhost", 8081);
        request.setContextPath("/stirling");

        assertThat(authorizeUrl(request))
                .isEqualTo("http://localhost:8081/stirling/link?request=req-1");
    }

    @Test
    void honoursTheForwardedSchemeAndHost() {
        MockHttpServletRequest request = request("http", "10.0.0.5", 8080);
        request.addHeader("X-Forwarded-Proto", "https");
        request.addHeader("X-Forwarded-Host", "api.example.com");

        assertThat(authorizeUrl(request)).isEqualTo("https://api.example.com/link?request=req-1");
    }

    @Test
    void takesOnlyTheFirstForwardedHop() {
        MockHttpServletRequest request = request("http", "10.0.0.5", 8080);
        request.addHeader("X-Forwarded-Proto", "https, http");
        request.addHeader("X-Forwarded-Host", "api.example.com, evil.example.com");

        assertThat(authorizeUrl(request)).isEqualTo("https://api.example.com/link?request=req-1");
    }

    @Test
    void percentEncodesTheRequestId() {
        when(service.create(anyString(), anyString(), anyString(), anyString(), any()))
                .thenReturn(ConnectRequestService.CreateResult.ok("a b&c", 1800));

        assertThat(authorizeUrl(request("https", "api.example.com", 443)))
                .isEqualTo("https://api.example.com/link?request=a+b%26c");
    }

    @Test
    void aBodylessRequestIsRejectedBeforeAnythingIsRecorded() {
        assertThat(controller.request(null, request("https", "api.example.com", 443)).getBody())
                .isEqualTo(java.util.Map.of("error", "BAD_REQUEST"));
    }

    @Test
    void offeringNoCredentialTakesTheFirstLinkPath() {
        authorizeUrl(request("https", "api.example.com", 443));

        // createReauth is the credentialled path; a first link must not reach it.
        org.mockito.Mockito.verify(service, org.mockito.Mockito.never())
                .createReauth(
                        anyString(),
                        anyString(),
                        anyString(),
                        anyString(),
                        any(),
                        isNull(),
                        isNull());
    }

    @Test
    void linkLookupAllowsTheTeamLeaderToApproveAndDeny() {
        pendingRequest(ConnectRequest.Mode.LINK);
        when(leaderTeams.resolve(auth)).thenReturn(new LeaderTeam(1L, 2L, null));

        var body = controller.view("req-1", auth).getBody();

        assertThat(body).isNotNull();
        assertThat(body.canApprove()).isTrue();
        assertThat(body.canDeny()).isTrue();
    }

    @Test
    void linkLookupKeepsTheRequestVisibleWithoutOfferingMemberDecisions() {
        pendingRequest(ConnectRequest.Mode.LINK);
        when(leaderTeams.resolve(auth))
                .thenReturn(new LeaderTeam(null, null, HttpStatus.FORBIDDEN));

        var response = controller.view("req-1", auth);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        var body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.callbackOrigin()).isEqualTo("https://pdf.example.com");
        assertThat(body.canApprove()).isFalse();
        assertThat(body.canDeny()).isFalse();
    }

    @Test
    void reauthLookupAllowsOnlyTheLinkedOwnerToRenew() {
        pendingRequest(ConnectRequest.Mode.REAUTH);
        when(leaderTeams.resolve(auth)).thenReturn(new LeaderTeam(1L, 2L, null));

        var body = controller.view("req-1", auth).getBody();

        assertThat(body).isNotNull();
        assertThat(body.canApprove()).isTrue();
        assertThat(body.canDeny()).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"1,3", "99,2", "99,3"})
    void reauthLookupOffersNoActionsToAnotherAccountOrTeam(Long teamId, Long userId) {
        pendingRequest(ConnectRequest.Mode.REAUTH);
        when(leaderTeams.resolve(auth)).thenReturn(new LeaderTeam(teamId, userId, null));

        var body = controller.view("req-1", auth).getBody();

        assertThat(body).isNotNull();
        assertThat(body.canApprove()).isFalse();
        assertThat(body.canDeny()).isFalse();
    }

    @Test
    void reauthRequiresTheLinkedAccountToStillOwnItsTeam() {
        pendingRequest(ConnectRequest.Mode.REAUTH);
        when(leaderTeams.resolve(auth))
                .thenReturn(new LeaderTeam(null, null, HttpStatus.FORBIDDEN));

        var body = controller.view("req-1", auth).getBody();
        assertThat(body).isNotNull();
        assertThat(body.canApprove()).isFalse();
        assertThat(body.canDeny()).isFalse();
        assertThat(controller.approve("req-1", auth).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        verify(service, never()).approve(anyString(), any(), any());
    }

    @Test
    void reauthCreationUsesTheAuthenticatedInstancesOriginalAccount() {
        LinkedInstance instance = new LinkedInstance();
        instance.setTeamId(1L);
        instance.setCreatedByUserId(2L);
        when(accountLinkService.resolveActiveInstance("device", "secret"))
                .thenReturn(Optional.of(instance));
        when(service.createReauth("prod-1", BODY.callbackUrl(), "n", "s", "127.0.0.1", 1L, 2L))
                .thenReturn(ConnectRequestService.CreateResult.ok("req-1", 1800));
        MockHttpServletRequest request = request("https", "api.example.com", 443);
        request.addHeader(ConnectController.HEADER_DEVICE_ID, "device");
        request.addHeader(ConnectController.HEADER_DEVICE_SECRET, "secret");

        assertThat(controller.request(BODY, request).getStatusCode()).isEqualTo(HttpStatus.CREATED);
        verify(service).createReauth("prod-1", BODY.callbackUrl(), "n", "s", "127.0.0.1", 1L, 2L);
    }

    @ParameterizedTest
    @CsvSource({"1,3", "99,2", "99,3"})
    void directRenewalPostsCannotApproveOrDenyForAnotherAccount(Long teamId, Long userId) {
        ConnectRequestRepository repo = mock(ConnectRequestRepository.class);
        ConnectRequest row = new ConnectRequest();
        row.setRequestId("req-1");
        row.setMode(ConnectRequest.Mode.REAUTH);
        row.setTeamId(1L);
        row.setApprovedByUserId(2L);
        row.setCallbackOrigin("https://pdf.example.com");
        row.setExpiresAt(LocalDateTime.now().plusMinutes(10));
        when(repo.findByRequestId("req-1")).thenReturn(Optional.of(row));
        when(repo.findByRequestIdForUpdate("req-1")).thenReturn(Optional.of(row));
        when(leaderTeams.resolve(auth)).thenReturn(new LeaderTeam(teamId, userId, null));
        ConnectController realController =
                new ConnectController(
                        new ConnectRequestService(repo, accountLinkService),
                        leaderTeams,
                        accountLinkService,
                        applicationProperties);

        var approval = realController.approve("req-1", auth);
        assertThat(approval.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(approval.getBody()).isEqualTo(java.util.Map.of("error", "WRONG_ACCOUNT"));
        assertThat(realController.deny("req-1", auth).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(row.getStatus()).isEqualTo(ConnectRequest.Status.PENDING);
        verify(repo, never()).save(any());
    }

    private void pendingRequest(ConnectRequest.Mode mode) {
        when(service.lookup("req-1"))
                .thenReturn(
                        Optional.of(
                                new ConnectRequestService.ConnectView(
                                        "req-1",
                                        "prod-1",
                                        "https://pdf.example.com",
                                        false,
                                        mode,
                                        ConnectRequest.Status.PENDING,
                                        1L,
                                        2L)));
    }
}
