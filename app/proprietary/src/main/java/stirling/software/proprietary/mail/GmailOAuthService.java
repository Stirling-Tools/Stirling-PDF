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
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
@Slf4j
public class GmailOAuthService {

    private static final String AUTHORIZATION_URI = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_URI = "https://oauth2.googleapis.com/token";
    private static final String USER_INFO_URI = "https://www.googleapis.com/oauth2/v3/userinfo";
    private static final String GMAIL_API_URI = "https://gmail.googleapis.com/gmail/v1/users/me";
    static final String READONLY_SCOPE =
            "openid email https://www.googleapis.com/auth/gmail.readonly";

    private final ObjectMapper objectMapper;
    private final GmailConnectionRepository connectionRepository;
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

    public void saveConnection(String username, GmailToken token, GmailProfile profile) {
        GmailConnectionEntity entity =
                connectionRepository.findByUsername(username).orElseGet(GmailConnectionEntity::new);
        String refreshToken = token.refreshToken();
        if ((refreshToken == null || refreshToken.isBlank())
                && entity.getRefreshToken() != null
                && !entity.getRefreshToken().isBlank()) {
            refreshToken = entity.getRefreshToken();
        }
        entity.setUsername(username);
        entity.setAccessToken(token.accessToken());
        entity.setRefreshToken(refreshToken == null ? "" : refreshToken);
        entity.setExpiresAt(token.expiresAt());
        entity.setEmail(profile.email());
        entity.setDisplayName(profile.name());
        connectionRepository.save(entity);
    }

    public GmailConnection getConnection(String username) {
        return connectionRepository
                .findByUsername(username)
                .map(
                        entity ->
                                new GmailConnection(
                                        new GmailToken(
                                                entity.getAccessToken(),
                                                entity.getRefreshToken(),
                                                entity.getExpiresAt()),
                                        new GmailProfile(
                                                entity.getEmail(), entity.getDisplayName())))
                .orElse(null);
    }

    /** Removes the local connection and revokes the Google grant when possible. */
    public boolean disconnect(String username) {
        GmailConnectionEntity entity = connectionRepository.findByUsername(username).orElse(null);
        if (entity == null) return false;
        boolean revoked = false;
        try {
            String revokeToken =
                    entity.getRefreshToken() == null || entity.getRefreshToken().isBlank()
                            ? entity.getAccessToken()
                            : entity.getRefreshToken();
            revoked = revokeToken(revokeToken);
        } catch (IOException e) {
            log.warn(
                    "Could not revoke Gmail OAuth grant for user '{}'; local connection removed",
                    username,
                    e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn(
                    "Gmail OAuth revoke interrupted for user '{}'; local connection removed",
                    username);
        } finally {
            connectionRepository.delete(entity);
        }
        return revoked;
    }

    private boolean revokeToken(String token) throws IOException, InterruptedException {
        HttpRequest request =
                HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/revoke"))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .POST(HttpRequest.BodyPublishers.ofString("token=" + encode(token)))
                        .build();
        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return response.statusCode() / 100 == 2 || response.statusCode() == 400;
    }

    public GmailToken getValidToken(String username) throws IOException, InterruptedException {
        GmailConnection connection = getConnection(username);
        if (connection == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED,
                    "Gmail mailbox is not connected");
        }
        GmailToken token = connection.token();
        if (token.expiresAt() > System.currentTimeMillis() + 60_000L) {
            return token;
        }
        if (token.refreshToken() == null || token.refreshToken().isBlank()) {
            throw new IOException("Gmail connection has no refresh token; reconnect required");
        }
        GmailToken refreshed = refreshToken(token.refreshToken());
        saveConnection(username, refreshed, connection.profile());
        return refreshed;
    }

    private GmailToken refreshToken(String refreshToken) throws IOException, InterruptedException {
        requireConfigured();
        Map<String, String> form = new LinkedHashMap<>();
        form.put("client_id", clientId);
        form.put("client_secret", clientSecret);
        form.put("refresh_token", refreshToken);
        form.put("grant_type", "refresh_token");
        HttpRequest request =
                HttpRequest.newBuilder(URI.create(TOKEN_URI))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .POST(HttpRequest.BodyPublishers.ofString(formEncode(form)))
                        .build();
        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new IOException(
                    "Gmail OAuth token refresh failed: HTTP " + response.statusCode());
        }
        JsonNode body = objectMapper.readTree(response.body());
        String accessToken = body.path("access_token").asText("");
        if (accessToken.isBlank()) {
            throw new IOException("Gmail OAuth refresh response did not contain an access token");
        }
        long expiresIn = body.path("expires_in").asLong(3600);
        return new GmailToken(
                accessToken, refreshToken, System.currentTimeMillis() + expiresIn * 1000L);
    }

    public GmailMessagePage listMessages(
            GmailToken token, String folder, String types, String query, String pageToken)
            throws IOException, InterruptedException {
        String label =
                switch (folder) {
                    case "starred" -> "STARRED";
                    case "trash" -> "TRASH";
                    default -> "INBOX";
                };
        String pageQuery =
                pageToken == null || pageToken.isBlank()
                        ? ""
                        : "&pageToken=" + URLEncoder.encode(pageToken, StandardCharsets.UTF_8);
        String gmailQuery = buildGmailQuery(types, query);
        JsonNode list =
                sendJson(
                        token,
                        GMAIL_API_URI
                                + "/messages?labelIds="
                                + label
                                + "&maxResults=25&q="
                                + URLEncoder.encode(gmailQuery, StandardCharsets.UTF_8)
                                + pageQuery);
        List<GmailMessage> messages = new ArrayList<>();
        Map<String, String> labelNames = loadLabelNames(token);
        for (JsonNode item : list.path("messages")) {
            JsonNode message =
                    sendJson(
                            token,
                            GMAIL_API_URI
                                    + "/messages/"
                                    + item.path("id").asText()
                                    + "?format=full");
            messages.add(toMessage(message, labelNames));
        }
        return new GmailMessagePage(messages, list.path("nextPageToken").asText(null));
    }

    private String buildGmailQuery(String types, String query) {
        StringBuilder gmailQuery = new StringBuilder("has:attachment");
        if (types != null && !types.isBlank()) {
            String filenameQuery =
                    Arrays.stream(types.split(","))
                            .map(String::trim)
                            .map(String::toLowerCase)
                            .filter(type -> type.matches("[a-z0-9]{1,10}"))
                            .distinct()
                            .map(type -> "filename:" + type)
                            .collect(Collectors.joining(" "));
            if (!filenameQuery.isBlank()) {
                gmailQuery.append(" {").append(filenameQuery).append("}");
            }
        }
        if (query != null && !query.isBlank()) {
            gmailQuery.append(' ').append(query.trim());
        }
        return gmailQuery.toString();
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

    private Map<String, String> loadLabelNames(GmailToken token)
            throws IOException, InterruptedException {
        Map<String, String> labelNames = new LinkedHashMap<>();
        JsonNode response = sendJson(token, GMAIL_API_URI + "/labels");
        for (JsonNode label : response.path("labels")) {
            String id = label.path("id").asText("");
            String name = label.path("name").asText("");
            if (!id.isBlank() && !name.isBlank()) {
                labelNames.put(id, name);
            }
        }
        return labelNames;
    }

    private GmailMessage toMessage(JsonNode message, Map<String, String> labelNames) {
        JsonNode payload = message.path("payload");
        String from = header(payload, "From");
        String subject = header(payload, "Subject");
        String date = header(payload, "Date");
        List<String> labels = new ArrayList<>();
        for (JsonNode labelId : message.path("labelIds")) {
            String id = labelId.asText("");
            String name = labelNames.get(id);
            if (!"UNREAD".equals(id) && name != null && !name.isBlank()) {
                labels.add(name);
            }
        }
        List<GmailAttachment> attachments = new ArrayList<>();
        collectAttachments(payload, attachments);
        return new GmailMessage(
                message.path("id").asText(),
                from,
                subject,
                message.path("snippet").asText(""),
                date,
                message.path("labelIds").toString().contains("UNREAD"),
                labels,
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
            List<String> labels,
            List<GmailAttachment> attachments) {}

    public record GmailMessagePage(List<GmailMessage> messages, String nextPageToken) {}

    public record GmailAttachment(String id, String name, String mimeType, long size) {}

    public record GmailAttachmentData(byte[] data) {}

    public record GmailConnection(GmailToken token, GmailProfile profile) {}
}
