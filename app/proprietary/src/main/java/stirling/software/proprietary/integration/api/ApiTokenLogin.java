package stirling.software.proprietary.integration.api;

import java.util.LinkedHashMap;
import java.util.Map;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * How a connection turns credentials into a short-lived token.
 *
 * <p>Modelled on what real APIs actually do rather than on one vendor. The two axes that vary are
 * where the token comes back ({@code tokenResponseHeader} or {@code tokenResponseJsonPath}) and how
 * it is then presented ({@code tokenHeaderName} + {@code tokenPrefix}). That covers both ends of
 * the spectrum:
 *
 * <ul>
 *   <li>ConsignO Cloud - {@code POST /auth/login} with {@code X-Client-Id}/{@code X-Client-Secret}
 *       headers and a {@code {username, password, tenantId}} body, returning the token in the
 *       {@code X-Auth-Token} <em>response header</em>, which is then sent back as {@code
 *       X-Auth-Token}.
 *   <li>OAuth2 client-credentials - a form or JSON post returning {@code {"access_token": ...}} in
 *       the body, sent back as {@code Authorization: Bearer ...}.
 * </ul>
 *
 * <p>{@code loginBody} and {@code loginHeaders} are stored as nested maps rather than a
 * pre-rendered JSON string so {@code SecretMasker} can recurse and mask the {@code password} /
 * {@code X-Client-Secret} entries inside them. A flat string would sail past it and hand the
 * password back in plaintext on every read of the connection.
 */
record ApiTokenLogin(
        String loginPath,
        Map<String, Object> loginBody,
        Map<String, String> loginHeaders,
        String tokenResponseHeader,
        String tokenResponseJsonPath,
        String tokenHeaderName,
        String tokenPrefix,
        int tokenTtlSeconds) {

    static final String LOGIN_PATH_OPTION = "loginPath";
    static final String LOGIN_BODY_OPTION = "loginBody";
    static final String LOGIN_HEADERS_OPTION = "loginHeaders";
    static final String TOKEN_RESPONSE_HEADER_OPTION = "tokenResponseHeader";
    static final String TOKEN_RESPONSE_JSON_PATH_OPTION = "tokenResponseJsonPath";
    static final String TOKEN_HEADER_NAME_OPTION = "tokenHeaderName";
    static final String TOKEN_PREFIX_OPTION = "tokenPrefix";
    static final String TOKEN_TTL_SECONDS_OPTION = "tokenTtlSeconds";

    /**
     * Conservative default. ConsignO's token lasts 30 minutes; caching for 25 leaves room for a
     * slow call to finish on a token that was still valid when it started. A cache that expired
     * exactly on the vendor's boundary would fail intermittently and look like a network fault.
     */
    static final int DEFAULT_TOKEN_TTL_SECONDS = 1500;

    private static final int MAX_TOKEN_TTL_SECONDS = 86400;

    ApiTokenLogin {
        loginBody = loginBody == null ? Map.of() : Map.copyOf(loginBody);
        loginHeaders = loginHeaders == null ? Map.of() : Map.copyOf(loginHeaders);
    }

    static ApiTokenLogin from(Map<String, Object> options) {
        String loginPath = trimmed(options.get(LOGIN_PATH_OPTION));
        if (loginPath == null) {
            throw new IllegalArgumentException(
                    "api config authType 'TOKEN_LOGIN' requires a 'loginPath', e.g. /auth/login");
        }
        String responseHeader = trimmed(options.get(TOKEN_RESPONSE_HEADER_OPTION));
        String responseJsonPath = trimmed(options.get(TOKEN_RESPONSE_JSON_PATH_OPTION));
        if ((responseHeader == null) == (responseJsonPath == null)) {
            throw new IllegalArgumentException(
                    "api config authType 'TOKEN_LOGIN' needs exactly one of"
                            + " 'tokenResponseHeader' (e.g. X-Auth-Token) or"
                            + " 'tokenResponseJsonPath' (e.g. access_token) to say where the token"
                            + " comes back");
        }
        String tokenHeaderName = trimmed(options.get(TOKEN_HEADER_NAME_OPTION));
        if (tokenHeaderName == null) {
            throw new IllegalArgumentException(
                    "api config authType 'TOKEN_LOGIN' requires a 'tokenHeaderName' saying which"
                            + " header carries the token back, e.g. X-Auth-Token or Authorization");
        }
        if (!ExternalApiHeaders.isValidName(tokenHeaderName)) {
            throw new IllegalArgumentException(
                    "api config 'tokenHeaderName' is not a valid HTTP header name: "
                            + tokenHeaderName);
        }
        if (responseHeader != null && !ExternalApiHeaders.isValidName(responseHeader)) {
            throw new IllegalArgumentException(
                    "api config 'tokenResponseHeader' is not a valid HTTP header name: "
                            + responseHeader);
        }

        return new ApiTokenLogin(
                loginPath,
                nestedObject(options.get(LOGIN_BODY_OPTION), LOGIN_BODY_OPTION),
                loginHeaders(options.get(LOGIN_HEADERS_OPTION)),
                responseHeader,
                responseJsonPath,
                tokenHeaderName,
                trimmed(options.get(TOKEN_PREFIX_OPTION)) == null
                        ? ""
                        : trimmed(options.get(TOKEN_PREFIX_OPTION)) + " ",
                ttl(options.get(TOKEN_TTL_SECONDS_OPTION)));
    }

    /** Pull the token out of a login response. */
    String extractToken(ExternalApiCaller.Response response, ObjectMapper objectMapper) {
        if (tokenResponseHeader != null) {
            String value = response.header(tokenResponseHeader);
            if (value == null || value.isBlank()) {
                throw new IllegalStateException(
                        "Login succeeded but returned no '"
                                + tokenResponseHeader
                                + "' response header");
            }
            return value;
        }
        JsonNode node = response.bodyAsJson(objectMapper);
        for (String segment : tokenResponseJsonPath.split("\\.")) {
            if (node == null) {
                break;
            }
            node = node.get(segment);
        }
        if (node == null || !node.isValueNode() || node.asString().isBlank()) {
            throw new IllegalStateException(
                    "Login succeeded but its body had no token at '" + tokenResponseJsonPath + "'");
        }
        return node.asString();
    }

    /** The header to send on an authenticated call. */
    Map.Entry<String, String> authHeader(String token) {
        return Map.entry(tokenHeaderName, tokenPrefix + token);
    }

    private static Map<String, Object> nestedObject(Object value, String option) {
        if (value == null) {
            return Map.of();
        }
        if (!(value instanceof Map<?, ?> raw)) {
            throw new IllegalArgumentException("api config '" + option + "' must be an object");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        raw.forEach((key, entry) -> out.put(String.valueOf(key), entry));
        return out;
    }

    private static Map<String, String> loginHeaders(Object value) {
        Map<String, String> out = new LinkedHashMap<>();
        nestedObject(value, LOGIN_HEADERS_OPTION)
                .forEach(
                        (name, entry) -> {
                            String headerValue = entry == null ? null : entry.toString();
                            if (!ExternalApiHeaders.isValidName(name)) {
                                throw new IllegalArgumentException(
                                        "api config 'loginHeaders' has an invalid header name: "
                                                + name);
                            }
                            if (headerValue == null
                                    || !ExternalApiHeaders.isValidValue(headerValue)) {
                                throw new IllegalArgumentException(
                                        "api config 'loginHeaders' has an invalid value for '"
                                                + name
                                                + "'");
                            }
                            out.put(name, headerValue);
                        });
        return out;
    }

    private static int ttl(Object value) {
        if (value == null) {
            return DEFAULT_TOKEN_TTL_SECONDS;
        }
        int seconds;
        try {
            seconds = Integer.parseInt(value.toString().trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("api config 'tokenTtlSeconds' must be a number");
        }
        if (seconds < 1 || seconds > MAX_TOKEN_TTL_SECONDS) {
            throw new IllegalArgumentException(
                    "api config 'tokenTtlSeconds' must be between 1 and " + MAX_TOKEN_TTL_SECONDS);
        }
        return seconds;
    }

    private static String trimmed(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    /** Never prints the login body or headers: both carry the credentials. */
    @Override
    public String toString() {
        return "ApiTokenLogin[loginPath="
                + loginPath
                + ", tokenTtlSeconds="
                + tokenTtlSeconds
                + "]";
    }
}
