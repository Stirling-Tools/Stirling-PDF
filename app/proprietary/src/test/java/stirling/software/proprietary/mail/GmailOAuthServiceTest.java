package stirling.software.proprietary.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpClient.Version;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

import javax.net.ssl.SSLSession;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class GmailOAuthServiceTest {

    @Mock private GmailConnectionRepository connectionRepository;

    @Mock private HttpClient httpClient;

    private GmailOAuthService service;

    @BeforeEach
    void setUp() {
        service = new GmailOAuthService(new ObjectMapper(), connectionRepository);
        ReflectionTestUtils.setField(service, "httpClient", httpClient);
    }

    @Test
    void alwaysRestrictsMessageSearchToMessagesWithAttachments() {
        String gmailQuery = buildQuery(null, null);

        assertThat(gmailQuery).isEqualTo("has:attachment");
    }

    @Test
    void buildsNormalizedMultiTypeAndTextQuery() {
        String gmailQuery = buildQuery(" PDF, png, PDF, invalid-type ", " from:billing invoice ");

        assertThat(gmailQuery)
                .isEqualTo("has:attachment {filename:pdf filename:png} from:billing invoice");
    }

    @Test
    void ignoresInvalidFileTypesButKeepsFreeTextSearch() {
        String gmailQuery = buildQuery("pdf,application,verylongextension123", "invoice");

        assertThat(gmailQuery).isEqualTo("has:attachment {filename:pdf} invoice");
    }

    @Test
    void parsesLabelsAndNestedAttachments() throws Exception {
        var message =
                new ObjectMapper()
                        .readTree(
                                """
                                {
                                  "id": "message-1",
                                  "snippet": "Invoice attached",
                                  "labelIds": ["INBOX", "UNREAD", "Label_1"],
                                  "payload": {
                                    "headers": [
                                      {"name": "From", "value": "Billing <billing@example.com>"},
                                      {"name": "Subject", "value": "Invoice"},
                                      {"name": "Date", "value": "Tue, 25 Aug 2026 10:00:00 +0000"}
                                    ],
                                    "parts": [
                                      {
                                        "filename": "invoice.pdf",
                                        "mimeType": "application/pdf",
                                        "body": {"attachmentId": "attachment-1", "size": 2048}
                                      }
                                    ]
                                  }
                                }
                                """);

        GmailOAuthService.GmailMessage result =
                ReflectionTestUtils.invokeMethod(
                        service,
                        "toMessage",
                        message,
                        Map.of("INBOX", "Inbox", "Label_1", "Finance"));

        assertThat(result).isNotNull();
        assertThat(result.id()).isEqualTo("message-1");
        assertThat(result.sender()).isEqualTo("Billing <billing@example.com>");
        assertThat(result.subject()).isEqualTo("Invoice");
        assertThat(result.unread()).isTrue();
        assertThat(result.labels()).containsExactly("Inbox", "Finance");
        assertThat(result.attachments())
                .singleElement()
                .satisfies(
                        attachment -> {
                            assertThat(attachment.id()).isEqualTo("attachment-1");
                            assertThat(attachment.name()).isEqualTo("invoice.pdf");
                            assertThat(attachment.mimeType()).isEqualTo("application/pdf");
                            assertThat(attachment.size()).isEqualTo(2048);
                        });
    }

    @Test
    void keepsExistingRefreshTokenWhenGoogleOmitsItOnRefresh() {
        GmailConnectionEntity existing = new GmailConnectionEntity();
        existing.setUsername("admin");
        existing.setRefreshToken("refresh-token");
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(existing));

        service.saveConnection(
                "admin",
                new GmailOAuthService.GmailToken("access-token", "", 123L),
                new GmailOAuthService.GmailProfile("admin@example.com", "Admin"));

        assertThat(existing.getAccessToken()).isEqualTo("access-token");
        assertThat(existing.getRefreshToken()).isEqualTo("refresh-token");
        assertThat(existing.getExpiresAt()).isEqualTo(123L);
        assertThat(existing.getEmail()).isEqualTo("admin@example.com");
        assertThat(existing.getDisplayName()).isEqualTo("Admin");
        verify(connectionRepository).save(existing);
    }

    @Test
    void rejectsRequestsWhenNoGmailConnectionExists() {
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getValidToken("admin"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        error -> {
                            ResponseStatusException exception = (ResponseStatusException) error;
                            assertThat(exception.getStatusCode())
                                    .isEqualTo(HttpStatus.UNAUTHORIZED);
                            assertThat(exception.getReason())
                                    .isEqualTo("Gmail mailbox is not connected");
                        });
    }

    @Test
    void disconnectDoesNothingWhenNoConnectionExists() {
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.empty());

        assertThat(service.disconnect("admin")).isFalse();

        verify(connectionRepository).findByUsername("admin");
    }

    @Test
    void createsAuthorizationUrlWithConfiguredClientAndRedirect() {
        ReflectionTestUtils.setField(service, "clientId", "client-id");
        ReflectionTestUtils.setField(service, "clientSecret", "client-secret");
        ReflectionTestUtils.setField(service, "redirectUri", "https://example.com/callback");

        String url =
                service.authorizationUrl(
                        "state-123", new org.springframework.mock.web.MockHttpServletRequest());

        assertThat(url)
                .contains("client_id=client-id")
                .contains("redirect_uri=https%3A%2F%2Fexample.com%2Fcallback")
                .contains("state=state-123")
                .contains("access_type=offline")
                .contains("prompt=consent");
    }

    @Test
    void exchangesCodeAndBuildsToken() throws Exception {
        ReflectionTestUtils.setField(service, "clientId", "client-id");
        ReflectionTestUtils.setField(service, "clientSecret", "client-secret");
        HttpResponse<String> response =
                response(
                        200,
                        "{\"access_token\":\"access\",\"refresh_token\":\"refresh\",\"expires_in\":3600}");
        when(httpClient.<String>send(any(), any())).thenReturn(response);

        GmailOAuthService.GmailToken token = service.exchangeCode("code", "https://callback");

        assertThat(token.accessToken()).isEqualTo("access");
        assertThat(token.refreshToken()).isEqualTo("refresh");
        assertThat(token.expiresAt()).isGreaterThan(System.currentTimeMillis());
    }

    @Test
    void rejectsFailedCodeExchange() throws Exception {
        ReflectionTestUtils.setField(service, "clientId", "client-id");
        ReflectionTestUtils.setField(service, "clientSecret", "client-secret");
        when(httpClient.<String>send(any(), any())).thenReturn(response(400, "{}"));

        assertThatThrownBy(() -> service.exchangeCode("code", "https://callback"))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("HTTP 400");
    }

    @Test
    void rejectsCodeExchangeWithoutAccessToken() throws Exception {
        ReflectionTestUtils.setField(service, "clientId", "client-id");
        ReflectionTestUtils.setField(service, "clientSecret", "client-secret");
        when(httpClient.<String>send(any(), any())).thenReturn(response(200, "{}"));

        assertThatThrownBy(() -> service.exchangeCode("code", "https://callback"))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("access token");
    }

    @Test
    void readsGmailProfile() throws Exception {
        HttpResponse<String> profileResponse =
                response(200, "{\"email\":\"admin@example.com\",\"name\":\"Admin\"}");
        when(httpClient.<String>send(any(), any())).thenReturn(profileResponse);

        assertThat(service.getProfile(new GmailOAuthService.GmailToken("access", "refresh", 1L)))
                .isEqualTo(new GmailOAuthService.GmailProfile("admin@example.com", "Admin"));
    }

    @Test
    void rejectsFailedGmailProfileRequest() throws Exception {
        when(httpClient.<String>send(any(), any())).thenReturn(response(403, "{}"));

        assertThatThrownBy(
                        () ->
                                service.getProfile(
                                        new GmailOAuthService.GmailToken("access", "refresh", 1L)))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("HTTP 403");
    }

    @Test
    void returnsStoredConnectionAndUnexpiredToken() throws Exception {
        GmailConnectionEntity entity =
                connectionEntity("admin", "access", "refresh", Long.MAX_VALUE);
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(entity));

        GmailOAuthService.GmailConnection connection = service.getConnection("admin");
        GmailOAuthService.GmailToken token = service.getValidToken("admin");

        assertThat(connection.profile().email()).isEqualTo("admin@example.com");
        assertThat(token.accessToken()).isEqualTo("access");
    }

    @Test
    void refreshesExpiredTokenAndPersistsNewAccessToken() throws Exception {
        GmailConnectionEntity entity = connectionEntity("admin", "old-access", "refresh", 0L);
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(entity));
        ReflectionTestUtils.setField(service, "clientId", "client-id");
        ReflectionTestUtils.setField(service, "clientSecret", "client-secret");
        HttpResponse<String> refreshResponse =
                response(200, "{\"access_token\":\"new-access\",\"expires_in\":3600}");
        when(httpClient.<String>send(any(), any())).thenReturn(refreshResponse);

        GmailOAuthService.GmailToken token = service.getValidToken("admin");

        assertThat(token.accessToken()).isEqualTo("new-access");
        assertThat(token.refreshToken()).isEqualTo("refresh");
        verify(connectionRepository).save(entity);
    }

    @Test
    void rejectsExpiredConnectionWithoutRefreshToken() {
        GmailConnectionEntity entity = connectionEntity("admin", "old-access", "", 0L);
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(entity));

        assertThatThrownBy(() -> service.getValidToken("admin"))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("no refresh token");
    }

    @Test
    void rejectsFailedTokenRefresh() throws Exception {
        GmailConnectionEntity entity = connectionEntity("admin", "old-access", "refresh", 0L);
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(entity));
        ReflectionTestUtils.setField(service, "clientId", "client-id");
        ReflectionTestUtils.setField(service, "clientSecret", "client-secret");
        when(httpClient.<String>send(any(), any())).thenReturn(response(401, "{}"));

        assertThatThrownBy(() -> service.getValidToken("admin"))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("HTTP 401");
    }

    @Test
    void listsMessagesWithLabelsAndNestedAttachments() throws Exception {
        HttpResponse<String> listResponse =
                response(200, "{\"messages\":[{\"id\":\"message-1\"}],\"nextPageToken\":\"next\"}");
        HttpResponse<String> labelsResponse =
                response(200, "{\"labels\":[{\"id\":\"INBOX\",\"name\":\"Inbox\"}]}");
        HttpResponse<String> messageResponse =
                response(
                        200,
                        "{\"id\":\"message-1\",\"snippet\":\"Invoice\",\"labelIds\":[\"INBOX\"],\"payload\":{\"headers\":[],\"parts\":[{\"filename\":\"invoice.pdf\",\"body\":{\"attachmentId\":\"a1\",\"size\":12}}]}}");
        when(httpClient.<String>send(any(), any()))
                .thenReturn(listResponse)
                .thenReturn(labelsResponse)
                .thenReturn(messageResponse);

        GmailOAuthService.GmailMessagePage page =
                service.listMessages(
                        new GmailOAuthService.GmailToken("access", "refresh", Long.MAX_VALUE),
                        "inbox",
                        "pdf",
                        "invoice",
                        "page-1");

        assertThat(page.nextPageToken()).isEqualTo("next");
        assertThat(page.messages())
                .singleElement()
                .satisfies(
                        message -> {
                            assertThat(message.labels()).containsExactly("Inbox");
                            assertThat(message.attachments())
                                    .singleElement()
                                    .extracting("name")
                                    .isEqualTo("invoice.pdf");
                        });
    }

    @Test
    void supportsStarredFolderAndBlankPageToken() throws Exception {
        when(httpClient.<String>send(any(), any()))
                .thenReturn(response(200, "{\"messages\":[]}"))
                .thenReturn(response(200, "{\"labels\":[]}"));

        GmailOAuthService.GmailMessagePage page =
                service.listMessages(
                        new GmailOAuthService.GmailToken("access", "refresh", Long.MAX_VALUE),
                        "starred",
                        null,
                        null,
                        " ");

        assertThat(page.messages()).isEmpty();
        assertThat(page.nextPageToken()).isNull();
    }

    @Test
    void supportsTrashFolder() throws Exception {
        when(httpClient.<String>send(any(), any()))
                .thenReturn(response(200, "{\"messages\":[]}"))
                .thenReturn(response(200, "{\"labels\":[]}"));

        assertThat(
                        service.listMessages(
                                        new GmailOAuthService.GmailToken(
                                                "access", "refresh", Long.MAX_VALUE),
                                        "trash",
                                        "",
                                        "",
                                        null)
                                .messages())
                .isEmpty();
    }

    @Test
    void downloadsBase64UrlEncodedAttachment() throws Exception {
        String encoded =
                Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[] {1, 2, 3});
        HttpResponse<String> attachmentResponse = response(200, "{\"data\":\"" + encoded + "\"}");
        when(httpClient.<String>send(any(), any())).thenReturn(attachmentResponse);

        assertThat(
                        service.downloadAttachment(
                                        new GmailOAuthService.GmailToken(
                                                "access", "refresh", Long.MAX_VALUE),
                                        "message-1",
                                        "attachment-1")
                                .data())
                .containsExactly(1, 2, 3);
    }

    @Test
    void revokesTokenAndDeletesConnection() throws Exception {
        GmailConnectionEntity entity =
                connectionEntity("admin", "access", "refresh", Long.MAX_VALUE);
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(entity));
        HttpResponse<String> revokeResponse = new StubHttpResponse(200, "");
        when(httpClient.<String>send(any(), any())).thenReturn(revokeResponse);

        assertThat(service.disconnect("admin")).isTrue();

        verify(connectionRepository).delete(entity);
    }

    @Test
    void deletesConnectionWhenGoogleRevokeFails() throws Exception {
        GmailConnectionEntity entity =
                connectionEntity("admin", "access", "refresh", Long.MAX_VALUE);
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(entity));
        when(httpClient.<String>send(any(), any())).thenReturn(response(500, ""));

        assertThat(service.disconnect("admin")).isFalse();
        verify(connectionRepository).delete(entity);
    }

    @Test
    void deletesConnectionWhenRevokeRequestFails() throws Exception {
        GmailConnectionEntity entity =
                connectionEntity("admin", "access", "refresh", Long.MAX_VALUE);
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(entity));
        when(httpClient.<String>send(any(), any())).thenThrow(new java.io.IOException("network"));

        assertThat(service.disconnect("admin")).isFalse();
        verify(connectionRepository).delete(entity);
    }

    @Test
    void restoresInterruptFlagWhenRevokeIsInterrupted() throws Exception {
        GmailConnectionEntity entity =
                connectionEntity("admin", "access", "refresh", Long.MAX_VALUE);
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(entity));
        when(httpClient.<String>send(any(), any()))
                .thenThrow(new InterruptedException("interrupted"));

        try {
            assertThat(service.disconnect("admin")).isFalse();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
        verify(connectionRepository).delete(entity);
    }

    @Test
    void usesAccessTokenWhenRefreshTokenIsBlank() throws Exception {
        GmailConnectionEntity entity = connectionEntity("admin", "access", "", Long.MAX_VALUE);
        when(connectionRepository.findByUsername("admin")).thenReturn(Optional.of(entity));
        when(httpClient.<String>send(any(), any())).thenReturn(response(400, ""));

        assertThat(service.disconnect("admin")).isTrue();
        verify(connectionRepository).delete(entity);
    }

    @Test
    void resolvesConfiguredAndContextRedirectUris() {
        ReflectionTestUtils.setField(service, "redirectUri", " https://example.com/callback ");
        var request = new org.springframework.mock.web.MockHttpServletRequest();
        request.setScheme("https");
        request.setServerName("mail.example.com");
        request.setServerPort(443);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        assertThat(service.resolveRedirectUri(request)).isEqualTo(" https://example.com/callback ");

        try {
            ReflectionTestUtils.setField(service, "redirectUri", "");
            assertThat(service.resolveRedirectUri(request))
                    .isEqualTo("https://mail.example.com/api/v1/email/gmail/callback");
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    @Test
    void rejectsAuthorizationWhenOAuthIsNotConfigured() {
        assertThatThrownBy(
                        () ->
                                service.authorizationUrl(
                                        "state",
                                        new org.springframework.mock.web.MockHttpServletRequest()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("not configured");
    }

    private static GmailConnectionEntity connectionEntity(
            String username, String accessToken, String refreshToken, long expiresAt) {
        GmailConnectionEntity entity = new GmailConnectionEntity();
        entity.setUsername(username);
        entity.setAccessToken(accessToken);
        entity.setRefreshToken(refreshToken);
        entity.setExpiresAt(expiresAt);
        entity.setEmail("admin@example.com");
        entity.setDisplayName("Admin");
        return entity;
    }

    private static HttpResponse<String> response(int status, String body) {
        return new StubHttpResponse(status, body);
    }

    private record StubHttpResponse(int statusCode, String body) implements HttpResponse<String> {
        @Override
        public HttpRequest request() {
            return null;
        }

        @Override
        public Optional<HttpResponse<String>> previousResponse() {
            return Optional.empty();
        }

        @Override
        public HttpHeaders headers() {
            return HttpHeaders.of(Map.of(), (name, value) -> true);
        }

        @Override
        public Optional<SSLSession> sslSession() {
            return Optional.empty();
        }

        @Override
        public URI uri() {
            return URI.create("https://example.com");
        }

        @Override
        public Version version() {
            return Version.HTTP_1_1;
        }
    }

    private String buildQuery(String types, String query) {
        return ReflectionTestUtils.invokeMethod(service, "buildGmailQuery", types, query);
    }
}
