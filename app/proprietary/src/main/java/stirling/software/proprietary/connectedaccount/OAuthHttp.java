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
import java.util.Map;
import java.util.stream.Collectors;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Form-encoded token requests and id-token decoding shared by the provider clients. */
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

    /**
     * Posts a token request and returns its JSON body.
     *
     * @throws OAuthException when the provider refuses; {@code invalid_grant} marks it revoked
     */
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
            // A refused or dropped connection carries no message of its own.
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

    /**
     * The claims of an id token, without verifying its signature. Safe only because the token
     * arrives directly from the provider's token endpoint over TLS in exchange for our own client
     * secret, never from the browser.
     */
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
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    public static OAuthTokens tokens(JsonNode body, OAuthTokens.AccountIdentity identity) {
        return new OAuthTokens(
                text(body, "access_token"),
                text(body, "refresh_token"),
                body.hasNonNull("expires_in") ? body.get("expires_in").asLong() : 3599,
                text(body, "scope"),
                identity);
    }

    static JsonNode parse(String body) {
        try {
            return JSON.readTree(body == null || body.isBlank() ? "{}" : body);
        } catch (RuntimeException e) {
            return JSON.createObjectNode();
        }
    }

    /** Entra appends trace and correlation ids on later lines; the first line is the reason. */
    private static String firstLine(String text) {
        int newline = text.indexOf('\n');
        return (newline < 0 ? text : text.substring(0, newline)).trim();
    }
}
