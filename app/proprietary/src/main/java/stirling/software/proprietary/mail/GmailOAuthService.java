package stirling.software.proprietary.mail;

import java.io.IOException;
import java.io.Serializable;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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
    private static final String GMAIL_API_URI = "https://gmail.googleapis.com/gmail/v1/users/me";
    static final String READONLY_SCOPE =
            "openid email https://www.googleapis.com/auth/gmail.readonly";

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final Map<String, GmailConnection> connections = new ConcurrentHashMap<>();

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

    public void saveConnection(String username, GmailToken token, GmailProfile profile) {
        connections.put(username, new GmailConnection(token, profile));
    }

    public GmailConnection getConnection(String username) {
        return connections.get(username);
    }

    public List<GmailMessage> listMessages(GmailToken token)
            throws IOException, InterruptedException {
        JsonNode list =
                sendJson(
                        token,
                        GMAIL_API_URI
                                + "/messages?labelIds=INBOX&maxResults=25&q=has%3Aattachment");
        List<GmailMessage> messages = new ArrayList<>();
        for (JsonNode item : list.path("messages")) {
            JsonNode message =
                    sendJson(
                            token,
                            GMAIL_API_URI
                                    + "/messages/"
                                    + item.path("id").asText()
                                    + "?format=full");
            messages.add(toMessage(message));
        }
        return messages;
    }

    public GmailAttachmentData downloadAttachment(
            GmailToken token, String messageId, String attachmentId)
            throws IOException, InterruptedException {
        JsonNode attachment =
                sendJson(
                        token,
                        GMAIL_API_URI + "/messages/" + messageId + "/attachments/" + attachmentId);
        byte[] data = Base64.getUrlDecoder().decode(attachment.path("data").asText(""));
        return new GmailAttachmentData(data);
    }

    private GmailMessage toMessage(JsonNode message) {
        JsonNode payload = message.path("payload");
        String from = header(payload, "From");
        String subject = header(payload, "Subject");
        String date = header(payload, "Date");
        List<GmailAttachment> attachments = new ArrayList<>();
        collectAttachments(payload, attachments);
        return new GmailMessage(
                message.path("id").asText(),
                from,
                subject,
                message.path("snippet").asText(""),
                date,
                message.path("labelIds").toString().contains("UNREAD"),
                attachments);
    }

    private void collectAttachments(JsonNode part, List<GmailAttachment> attachments) {
        String filename = part.path("filename").asText("");
        String attachmentId = part.path("body").path("attachmentId").asText("");
        if (!filename.isBlank() && !attachmentId.isBlank()) {
            attachments.add(
                    new GmailAttachment(
                            attachmentId,
                            filename,
                            part.path("mimeType").asText("application/octet-stream"),
                            part.path("body").path("size").asLong(0)));
        }
        for (JsonNode child : part.path("parts")) {
            collectAttachments(child, attachments);
        }
    }

    private String header(JsonNode payload, String name) {
        for (JsonNode header : payload.path("headers")) {
            if (name.equalsIgnoreCase(header.path("name").asText())) {
                return header.path("value").asText("");
            }
        }
        return "";
    }

    private JsonNode sendJson(GmailToken token, String url)
            throws IOException, InterruptedException {
        HttpRequest request =
                HttpRequest.newBuilder(URI.create(url))
                        .header("Authorization", "Bearer " + token.accessToken())
                        .GET()
                        .build();
        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new IOException("Gmail API request failed: HTTP " + response.statusCode());
        }
        return objectMapper.readTree(response.body());
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

    public record GmailMessage(
            String id,
            String sender,
            String subject,
            String preview,
            String date,
            boolean unread,
            List<GmailAttachment> attachments) {}

    public record GmailAttachment(String id, String name, String mimeType, long size) {}

    public record GmailAttachmentData(byte[] data) {}

    public record GmailConnection(GmailToken token, GmailProfile profile) {}
}
