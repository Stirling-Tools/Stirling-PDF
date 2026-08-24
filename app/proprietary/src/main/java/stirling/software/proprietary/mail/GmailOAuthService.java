package stirling.software.proprietary.mail;

import java.io.IOException;
import java.io.Serializable;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class GmailOAuthService {

    private static final String AUTHORIZATION_URI = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_URI = "https://oauth2.googleapis.com/token";
    private static final String USER_INFO_URI = "https://www.googleapis.com/oauth2/v3/userinfo";
    static final String READONLY_SCOPE =
            "openid email https://www.googleapis.com/auth/gmail.readonly";

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Value("${mailbox.gmail.client-id:}")
    private String clientId;

    @Value("${mailbox.gmail.client-secret:}")
    private String clientSecret;

    @Value("${mailbox.gmail.redirect-uri:}")
    private String redirectUri;

    public String authorizationUrl(String state, HttpServletRequest request) {
        requireConfigured();
        String resolvedRedirectUri = resolveRedirectUri(request);
        Map<String, String> params = new LinkedHashMap<>();
        params.put("client_id", clientId);
        params.put("redirect_uri", resolvedRedirectUri);
        params.put("response_type", "code");
        params.put("scope", READONLY_SCOPE);
        params.put("access_type", "offline");
        params.put("prompt", "consent");
        params.put("state", state);
        return AUTHORIZATION_URI + "?" + formEncode(params);
    }

    public GmailToken exchangeCode(String code, String resolvedRedirectUri)
            throws IOException, InterruptedException {
        requireConfigured();
        Map<String, String> form = new LinkedHashMap<>();
        form.put("code", code);
        form.put("client_id", clientId);
        form.put("client_secret", clientSecret);
        form.put("redirect_uri", resolvedRedirectUri);
        form.put("grant_type", "authorization_code");

        HttpRequest request =
                HttpRequest.newBuilder(URI.create(TOKEN_URI))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .POST(HttpRequest.BodyPublishers.ofString(formEncode(form)))
                        .build();
        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new IOException(
                    "Gmail OAuth token exchange failed: HTTP " + response.statusCode());
        }
        JsonNode body = objectMapper.readTree(response.body());
        String accessToken = body.path("access_token").asText("");
        String refreshToken = body.path("refresh_token").asText("");
        long expiresIn = body.path("expires_in").asLong(3600);
        if (accessToken.isBlank())
            throw new IOException("Gmail OAuth response did not contain an access token");
        return new GmailToken(
                accessToken, refreshToken, System.currentTimeMillis() + expiresIn * 1000L);
    }

    public GmailProfile getProfile(GmailToken token) throws IOException, InterruptedException {
        HttpRequest request =
                HttpRequest.newBuilder(URI.create(USER_INFO_URI))
                        .header("Authorization", "Bearer " + token.accessToken())
                        .GET()
                        .build();
        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new IOException("Gmail profile request failed: HTTP " + response.statusCode());
        }
        JsonNode body = objectMapper.readTree(response.body());
        return new GmailProfile(body.path("email").asText(""), body.path("name").asText(""));
    }

    public String resolveRedirectUri(HttpServletRequest request) {
        if (redirectUri != null && !redirectUri.isBlank()) return redirectUri;
        return ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/v1/email/gmail/callback")
                .build()
                .toUriString();
    }

    private void requireConfigured() {
        if (clientId.isBlank() || clientSecret.isBlank()) {
            throw new IllegalStateException("Gmail OAuth is not configured on the server");
        }
    }

    private static String formEncode(Map<String, String> values) {
        return values.entrySet().stream()
                .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
                .collect(java.util.stream.Collectors.joining("&"));
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    public record GmailToken(String accessToken, String refreshToken, long expiresAt)
            implements Serializable {}

    public record GmailProfile(String email, String name) implements Serializable {}
}
