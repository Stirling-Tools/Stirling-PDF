package stirling.software.proprietary.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContextHolder;

import jakarta.servlet.http.HttpSession;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;

@ExtendWith(MockitoExtension.class)
class GmailOAuthControllerTest {

    @Mock private GmailOAuthService gmailOAuthService;

    @Mock private UserServiceInterface userService;

    private ApplicationProperties applicationProperties;
    private GmailOAuthController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        controller =
                new GmailOAuthController(gmailOAuthService, applicationProperties, userService);
        lenient().when(userService.getCurrentUsername()).thenReturn("admin");
        SecurityContextHolder.clearContext();
    }

    @Test
    void connectStoresOAuthStateAndReturnsAuthorizationUrl() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/v1/email/gmail/connect");
        when(gmailOAuthService.resolveRedirectUri(request))
                .thenReturn("https://frontend.example.com/api/v1/email/gmail/callback");
        when(gmailOAuthService.authorizationUrl(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.same(request)))
                .thenReturn("https://accounts.google.com/oauth");

        var result = controller.connect(request);

        assertThat(result.getBody())
                .containsEntry("authorizationUrl", "https://accounts.google.com/oauth");
        HttpSession session = request.getSession(false);
        assertThat(session.getAttribute(GmailOAuthController.STATE_SESSION_KEY))
                .isInstanceOf(String.class);
        assertThat(session.getAttribute(GmailOAuthController.USER_SESSION_KEY)).isEqualTo("admin");
        assertThat(session.getAttribute(GmailOAuthController.REDIRECT_URI_SESSION_KEY))
                .isEqualTo("https://frontend.example.com/api/v1/email/gmail/callback");
    }

    @Test
    void reportsDisconnectedWhenNoSessionOrPersistentConnectionExists() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        when(gmailOAuthService.getConnection("admin")).thenReturn(null);

        assertThat(controller.status(request).getBody()).isEqualTo(Map.of("connected", false));
    }

    @Test
    void reportsTheSessionProfileBeforeLookingAtPersistentConnection() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true)
                .setAttribute(
                        GmailOAuthController.PROFILE_SESSION_KEY,
                        new GmailOAuthService.GmailProfile("admin@example.com", "Admin"));

        var body = controller.status(request).getBody();

        assertThat(body)
                .isEqualTo(
                        Map.of(
                                "connected",
                                true,
                                "email",
                                "admin@example.com",
                                "provider",
                                "Gmail"));
    }

    @Test
    void usesPersistentConnectionWhenSessionProfileIsMissing() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        when(gmailOAuthService.getConnection("admin"))
                .thenReturn(
                        new GmailOAuthService.GmailConnection(
                                new GmailOAuthService.GmailToken("access", "refresh", 1L),
                                new GmailOAuthService.GmailProfile("admin@example.com", "Admin")));

        assertThat(controller.status(request).getBody())
                .isEqualTo(
                        Map.of(
                                "connected",
                                true,
                                "email",
                                "admin@example.com",
                                "provider",
                                "Gmail"));
    }

    @Test
    void disconnectsConnectionAndClearsSessionAttributes() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpSession session = (MockHttpSession) request.getSession(true);
        session.setAttribute(GmailOAuthController.PROFILE_SESSION_KEY, "profile");
        session.setAttribute(GmailOAuthController.USER_SESSION_KEY, "admin");
        when(gmailOAuthService.disconnect("admin")).thenReturn(true);

        assertThat(controller.disconnect(request).getBody())
                .containsEntry("disconnected", true)
                .containsEntry("googleRevoked", true);
        assertThat(session.getAttribute(GmailOAuthController.PROFILE_SESSION_KEY)).isNull();
        verify(gmailOAuthService).disconnect("admin");
    }

    @Test
    void forwardsMessageQueryToServiceWithCurrentToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        var token = new GmailOAuthService.GmailToken("access", "refresh", Long.MAX_VALUE);
        var page = new GmailOAuthService.GmailMessagePage(List.of(), "next");
        when(gmailOAuthService.getValidToken("admin")).thenReturn(token);
        when(gmailOAuthService.listMessages(token, "starred", "pdf,png", "invoice", "page-2"))
                .thenReturn(page);

        assertThat(
                        controller
                                .messages("starred", "pdf,png", "invoice", "page-2", request)
                                .getBody())
                .isSameAs(page);
        verify(gmailOAuthService).listMessages(token, "starred", "pdf,png", "invoice", "page-2");
    }

    @Test
    void returnsAttachmentAsDownload() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        var token = new GmailOAuthService.GmailToken("access", "refresh", Long.MAX_VALUE);
        when(gmailOAuthService.getValidToken("admin")).thenReturn(token);
        when(gmailOAuthService.downloadAttachment(token, "message-1", "file-1"))
                .thenReturn(new GmailOAuthService.GmailAttachmentData(new byte[] {1, 2, 3}));

        var response = controller.attachment("message-1", "file-1", request);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getHeaders().getContentType().toString())
                .isEqualTo("application/octet-stream");
        assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("file-1");
        assertThat(response.getBody()).containsExactly(1, 2, 3);
    }

    @Test
    void rejectsCallbackWithMissingState() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        controller.callback("code", "state", null, null, request, response);

        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getErrorMessage()).contains("missing or expired code/state");
    }

    @Test
    void rejectsCallbackWhenGoogleReturnsAnError() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        controller.callback(null, null, "access_denied", "User denied access", request, response);

        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getErrorMessage()).contains("access_denied: User denied access");
    }

    @Test
    void exchangesSuccessfulCallbackPersistsConnectionAndRedirectsToFrontend() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockHttpSession session = (MockHttpSession) request.getSession(true);
        session.setAttribute(GmailOAuthController.STATE_SESSION_KEY, "expected-state");
        session.setAttribute(GmailOAuthController.REDIRECT_URI_SESSION_KEY, "https://callback");
        session.setAttribute(GmailOAuthController.USER_SESSION_KEY, "admin");
        applicationProperties.getSystem().setFrontendUrl("https://frontend.example.com/");
        var token = new GmailOAuthService.GmailToken("access", "refresh", Long.MAX_VALUE);
        var profile = new GmailOAuthService.GmailProfile("admin@example.com", "Admin");
        when(gmailOAuthService.exchangeCode("code", "https://callback")).thenReturn(token);
        when(gmailOAuthService.getProfile(token)).thenReturn(profile);

        controller.callback("code", "expected-state", null, null, request, response);

        assertThat(response.getRedirectedUrl())
                .isEqualTo("https://frontend.example.com/mail?gmail=connected");
        assertThat(session.getAttribute(GmailOAuthController.STATE_SESSION_KEY)).isNull();
        assertThat(session.getAttribute(GmailOAuthController.PROFILE_SESSION_KEY))
                .isEqualTo(profile);
        verify(gmailOAuthService).saveConnection("admin", token, profile);
    }
}
