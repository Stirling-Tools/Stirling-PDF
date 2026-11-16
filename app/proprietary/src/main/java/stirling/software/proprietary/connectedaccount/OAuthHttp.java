package stirling.software.proprietary.connectedaccount;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

import stirling.software.proprietary.policy.remote.CloudHttp;
import stirling.software.proprietary.policy.remote.ExpiringTokenCache;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

public final class OAuthHttp {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpClient HTTP =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();

    private OAuthHttp() {}

    public static String form(Map<String, String> fields) {
        return fields.entrySet().stream()
                .filter(e -> e.getValue() != null)
                .map(e -> encode(e.getKey()) + "=" + encode(e.getValue()))
                .collect(Collectors.joining("&"));
    }

    public static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    public static Map<String, String> authorizationCodeGrant(
            String clientId,
            String clientSecret,
            String code,
            String codeVerifier,
            String redirectUri) {
        Map<String, String> form = clientGrant(clientId, clientSecret, "authorization_code");
        form.put("code", code);
        form.put("code_verifier", codeVerifier);
        form.put("redirect_uri", redirectUri);
        return form;
    }

    public static Map<String, String> refreshGrant(
            String clientId, String clientSecret, String refreshToken) {
        Map<String, String> form = clientGrant(clientId, clientSecret, "refresh_token");
        form.put("refresh_token", refreshToken);
        return form;
    }

    private static Map<String, String> clientGrant(
            String clientId, String clientSecret, String grantType) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("client_id", clientId);
        form.put("client_secret", clientSecret);
        form.put("grant_type", grantType);
        return form;
    }

    public static JsonNode postTokenRequest(String url, Map<String, String> fields)
            throws IOException {
        HttpRequest request =
                HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(30))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(form(fields)))
                        .build();
        HttpResponse<String> response;
        try {
            response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted calling the sign-in service", e);
        } catch (IOException e) {
            throw new IOException(
                    "Could not reach the sign-in service ("
                            + (e.getMessage() == null
                                    ? e.getClass().getSimpleName()
                                    : e.getMessage())
                            + ")",
                    e);
        }
        JsonNode body = parse(response.body());
        if (response.statusCode() >= 200
                && response.statusCode() < 300
                && body.hasNonNull("access_token")) {
            return body;
        }
        String error = text(body, "error");
        String description = text(body, "error_description");
        String detail = description != null ? firstLine(description) : error;
        throw new OAuthException(
                "sign-in refused: " + (detail == null ? "HTTP " + response.statusCode() : detail),
                "invalid_grant".equals(error));
    }

    public static JsonNode idTokenClaims(String idToken) {
        if (idToken == null) {
            return JSON.createObjectNode();
        }
        String[] parts = idToken.split("\\.");
        if (parts.length < 2) {
            return JSON.createObjectNode();
        }
        return parse(new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8));
    }

    public static String text(JsonNode node, String field) {
        return CloudHttp.text(node, field);
    }

    public static OAuthTokens tokens(JsonNode body, OAuthTokens.AccountIdentity identity) {
        return new OAuthTokens(
                text(body, "access_token"),
                text(body, "refresh_token"),
                expiresInSeconds(body),
                text(body, "scope"),
                identity);
    }

    public static ExpiringTokenCache.Token accessToken(JsonNode body) {
        return new ExpiringTokenCache.Token(text(body, "access_token"), expiresInSeconds(body));
    }

    private static long expiresInSeconds(JsonNode body) {
        return body.hasNonNull("expires_in") ? body.get("expires_in").asLong() : 3599;
    }

    private static JsonNode parse(String body) {
        return CloudHttp.parse(body);
    }

    private static String firstLine(String text) {
        int newline = text.indexOf('\n');
        return (newline < 0 ? text : text.substring(0, newline)).trim();
    }
}
