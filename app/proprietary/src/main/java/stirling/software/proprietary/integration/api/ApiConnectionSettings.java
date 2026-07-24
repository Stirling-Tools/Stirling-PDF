package stirling.software.proprietary.integration.api;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * A resolved {@code API} connection: where to call, and how to authenticate.
 *
 * <p>{@code baseUrl} is the security anchor of the whole feature. It is set by whoever can manage
 * the connection (an admin or team owner) and is the only thing that decides which host is
 * contacted. A pipeline step supplies a <em>relative path</em> only, resolved under this base by
 * {@link ExternalApiPaths}, so a step author can never pivot the call to a host of their choosing.
 * Widening that - letting a step pass a full URL - would turn every policy into an SSRF primitive.
 *
 * <p>Whether the base URL may resolve to a private address is deliberately <em>not</em> a field
 * here. Any user may create an API connection (unlike S3, which {@code IntegrationConfigService}
 * restricts to admins), so a per-connection opt-in would let a user grant themselves a fetch of the
 * cloud metadata service. It is an operator property instead - {@code
 * policies.allowPrivateApiEndpoints} - checked by {@link ApiIntegrationValidator}.
 */
public record ApiConnectionSettings(
        String baseUrl,
        ApiAuthType authType,
        String headerName,
        String headerPrefix,
        String token,
        String username,
        String password,
        Map<String, String> headers,
        ApiTokenLogin tokenLogin,
        Set<String> resultUrlHosts,
        int timeoutSeconds) {

    static final String BASE_URL_OPTION = "baseUrl";
    static final String AUTH_TYPE_OPTION = "authType";
    static final String HEADER_NAME_OPTION = "headerName";
    static final String HEADER_PREFIX_OPTION = "headerPrefix";
    // "token"/"password" contain SecretMasker hints, so they mask on read and merge on update.
    static final String TOKEN_OPTION = "token";
    static final String USERNAME_OPTION = "username";
    static final String PASSWORD_OPTION = "password";
    static final String HEADERS_OPTION = "headers";
    static final String RESULT_URL_HOSTS_OPTION = "resultUrlHosts";
    static final String TIMEOUT_SECONDS_OPTION = "timeoutSeconds";

    static final int DEFAULT_TIMEOUT_SECONDS = 60;
    private static final int MAX_TIMEOUT_SECONDS = 600;

    public ApiConnectionSettings {
        headers = headers == null ? Map.of() : Map.copyOf(headers);
        resultUrlHosts = resultUrlHosts == null ? Set.of() : Set.copyOf(resultUrlHosts);
    }

    /**
     * @throws IllegalArgumentException if the config is unusable; the message is surfaced to the
     *     operator editing the connection, so it names the offending option.
     */
    public static ApiConnectionSettings from(Map<String, Object> options) {
        String baseUrl = trimmed(options.get(BASE_URL_OPTION));
        if (baseUrl == null) {
            throw new IllegalArgumentException("api config requires a 'baseUrl' option");
        }
        URI uri = parseHttpUrl(baseUrl);
        if (uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException(
                    "api config 'baseUrl' must not carry a query string or fragment");
        }

        ApiAuthType authType = parseAuthType(trimmed(options.get(AUTH_TYPE_OPTION)));
        String headerName = trimmed(options.get(HEADER_NAME_OPTION));
        // Many APIs want a scheme before the token ("Authorization: Token abc",
        // "Authorization: DeepL-Auth-Key abc"). Without this a preset would have to make the
        // operator paste the scheme into the secret itself, which reads as a typo waiting to
        // happen.
        String headerPrefix = trimmed(options.get(HEADER_PREFIX_OPTION));
        String token = trimmed(options.get(TOKEN_OPTION));
        String username = trimmed(options.get(USERNAME_OPTION));
        String password = trimmed(options.get(PASSWORD_OPTION));

        switch (authType) {
            case BEARER -> require(token, "api config authType 'BEARER' requires a 'token'");
            case HEADER -> {
                require(token, "api config authType 'HEADER' requires a 'token'");
                require(headerName, "api config authType 'HEADER' requires a 'headerName'");
                if (!ExternalApiHeaders.isValidName(headerName)) {
                    throw new IllegalArgumentException(
                            "api config 'headerName' is not a valid HTTP header name: "
                                    + headerName);
                }
            }
            case BASIC -> {
                require(username, "api config authType 'BASIC' requires a 'username'");
                require(password, "api config authType 'BASIC' requires a 'password'");
            }
            case TOKEN_LOGIN -> {
                /* validated by ApiTokenLogin.from below */
            }
            case NONE -> {
                /* nothing to check */
            }
        }

        return new ApiConnectionSettings(
                stripTrailingSlash(baseUrl),
                authType,
                headerName,
                headerPrefix,
                token,
                username,
                password,
                parseHeaders(options.get(HEADERS_OPTION)),
                authType == ApiAuthType.TOKEN_LOGIN ? ApiTokenLogin.from(options) : null,
                parseResultUrlHosts(options.get(RESULT_URL_HOSTS_OPTION)),
                parseTimeout(options.get(TIMEOUT_SECONDS_OPTION)));
    }

    /** The configured base as a URI; callers resolve step paths under it. */
    public URI baseUri() {
        return URI.create(baseUrl);
    }

    /**
     * Identity of this connection's login for token-cache purposes. Includes the credentials, so
     * editing a password evicts the token cached under the old one rather than reusing it until it
     * expires.
     */
    String tokenCacheKey() {
        return baseUrl + "|" + Objects.hash(tokenLogin);
    }

    private static URI parseHttpUrl(String value) {
        URI uri;
        try {
            uri = new URI(value);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("api config 'baseUrl' is not a valid URL", e);
        }
        String scheme = uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new IllegalArgumentException(
                    "api config 'baseUrl' must be an http(s) URL, e.g. https://api.example.com");
        }
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("api config 'baseUrl' must include a host");
        }
        return uri;
    }

    private static ApiAuthType parseAuthType(String value) {
        if (value == null) {
            return ApiAuthType.NONE;
        }
        try {
            return ApiAuthType.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "api config 'authType' must be one of NONE, BEARER, BASIC, HEADER; got "
                            + value);
        }
    }

    /** Static headers sent on every call. Rejects anything auth-bearing to keep one auth path. */
    private static Map<String, String> parseHeaders(Object value) {
        if (value == null) {
            return Map.of();
        }
        if (!(value instanceof Map<?, ?> raw)) {
            throw new IllegalArgumentException("api config 'headers' must be an object");
        }
        Map<String, String> headers = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : raw.entrySet()) {
            String name = trimmed(entry.getKey());
            String headerValue = entry.getValue() == null ? null : entry.getValue().toString();
            if (name == null) {
                continue;
            }
            if (!ExternalApiHeaders.isValidName(name)) {
                throw new IllegalArgumentException(
                        "api config 'headers' has an invalid header name: " + name);
            }
            if (ExternalApiHeaders.isReserved(name)) {
                throw new IllegalArgumentException(
                        "api config 'headers' must not set '"
                                + name
                                + "'; use 'authType' and 'token' instead");
            }
            if (headerValue == null || !ExternalApiHeaders.isValidValue(headerValue)) {
                throw new IllegalArgumentException(
                        "api config 'headers' has an invalid value for '" + name + "'");
            }
            headers.put(name, headerValue);
        }
        return headers;
    }

    /**
     * Hosts a result may be fetched from, beyond the connection's own. Declared by the operator
     * because the alternative - trusting the host named in the API's response - is an SSRF.
     */
    private static Set<String> parseResultUrlHosts(Object value) {
        if (value == null) {
            return Set.of();
        }
        if (!(value instanceof java.util.List<?> list)) {
            throw new IllegalArgumentException(
                    "api config 'resultUrlHosts' must be a list of hostnames");
        }
        Set<String> out = new java.util.LinkedHashSet<>();
        for (Object entry : list) {
            String host = trimmed(entry);
            if (host == null) {
                continue;
            }
            if (host.contains("/") || host.contains(":") || host.contains("*")) {
                // A URL, port or wildcard here would read as broader than it is; subdomains are
                // already covered by the "endsWith('.' + host)" rule at match time.
                throw new IllegalArgumentException(
                        "api config 'resultUrlHosts' takes bare hostnames, e.g."
                                + " cdn.vendor.com; got "
                                + host);
            }
            out.add(host.toLowerCase(Locale.ROOT));
        }
        return out;
    }

    private static int parseTimeout(Object value) {
        if (value == null) {
            return DEFAULT_TIMEOUT_SECONDS;
        }
        int seconds;
        try {
            seconds = Integer.parseInt(value.toString().trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("api config 'timeoutSeconds' must be a number");
        }
        if (seconds < 1 || seconds > MAX_TIMEOUT_SECONDS) {
            throw new IllegalArgumentException(
                    "api config 'timeoutSeconds' must be between 1 and " + MAX_TIMEOUT_SECONDS);
        }
        return seconds;
    }

    private static void require(String value, String message) {
        if (value == null) {
            throw new IllegalArgumentException(message);
        }
    }

    private static String stripTrailingSlash(String value) {
        String out = value;
        while (out.endsWith("/")) {
            out = out.substring(0, out.length() - 1);
        }
        return out;
    }

    private static String trimmed(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    /** Never prints the credentials, so an accidental log line cannot leak them. */
    @Override
    public String toString() {
        return "ApiConnectionSettings[baseUrl="
                + baseUrl
                + ", authType="
                + authType
                + ", timeoutSeconds="
                + timeoutSeconds
                + "]";
    }
}
