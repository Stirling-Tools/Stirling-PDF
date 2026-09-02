package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.saas.accountlink.ConnectController.CreateBody;
import stirling.software.saas.accountlink.ConnectController.CreateResponse;

/**
 * The authorize URL the instance is told to send its admin to. Everything else on this controller
 * delegates; this is the only decision it makes on its own.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConnectControllerTest {

    private static final CreateBody BODY =
            new CreateBody("prod-1", "https://pdf.example.com/account-link/callback", "n", "s");

    @Mock private ConnectRequestService service;
    @Mock private LeaderTeamResolver leaderTeams;
    @Mock private AccountLinkService accountLinkService;

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
                .createReauth(anyString(), anyString(), anyString(), anyString(), any(), isNull());
    }
}
