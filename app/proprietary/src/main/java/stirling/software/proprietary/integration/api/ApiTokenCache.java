package stirling.software.proprietary.integration.api;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.springframework.http.MediaType;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.ObjectMapper;

/**
 * Obtains and caches the short-lived tokens of {@link ApiAuthType#TOKEN_LOGIN} connections.
 *
 * <p>The step that uses a token is stateless and runs once per document, so without a cache a
 * hundred-document policy would perform a hundred logins - which many vendors rate-limit, and some
 * treat as suspicious. The cache is keyed on the connection's login identity (credentials included)
 * so that editing a password does not keep reusing the token bought with the old one.
 *
 * <p>Entries expire well inside the vendor's stated lifetime, and a 401 additionally evicts and
 * retries once ({@link ExternalApiCaller}), so a token that expires early - or is revoked - costs
 * one retry rather than a failed run.
 */
@Slf4j
public class ApiTokenCache {

    /** Bounded so a deployment with many connections cannot grow this without limit. */
    private static final int MAX_ENTRIES = 500;

    private final Cache<String, String> tokens;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    ApiTokenCache(HttpClient httpClient, ObjectMapper objectMapper) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        this.tokens =
                Caffeine.newBuilder()
                        .maximumSize(MAX_ENTRIES)
                        // Per-entry, because each connection states its own lifetime.
                        .expireAfter(
                                new com.github.benmanes.caffeine.cache.Expiry<String, String>() {
                                    @Override
                                    public long expireAfterCreate(
                                            String key, String value, long currentTime) {
                                        return ttlNanos(key);
                                    }

                                    @Override
                                    public long expireAfterUpdate(
                                            String key,
                                            String value,
                                            long currentTime,
                                            long currentDuration) {
                                        return ttlNanos(key);
                                    }

                                    @Override
                                    public long expireAfterRead(
                                            String key,
                                            String value,
                                            long currentTime,
                                            long currentDuration) {
                                        // Reading must not extend a token's life: the vendor's
                                        // clock is running regardless of how often we use it.
                                        return currentDuration;
                                    }
                                })
                        .build();
    }

    // The TTL travels in the key so the Expiry callbacks can see it without a second lookup.
    private static long ttlNanos(String key) {
        int seconds = Integer.parseInt(key.substring(key.lastIndexOf('#') + 1));
        return TimeUnit.SECONDS.toNanos(seconds);
    }

    /**
     * The connection's current token, logging in if there is not a live one.
     *
     * @throws IOException if the login call fails or returns no token
     */
    String token(ApiConnectionSettings settings) throws IOException {
        String key = cacheKey(settings);
        String cached = tokens.getIfPresent(key);
        if (cached != null) {
            return cached;
        }
        String token = login(settings);
        tokens.put(key, token);
        return token;
    }

    /** Drop the cached token, e.g. after a 401 says it is no longer accepted. */
    void invalidate(ApiConnectionSettings settings) {
        tokens.invalidate(cacheKey(settings));
    }

    private static String cacheKey(ApiConnectionSettings settings) {
        return settings.tokenCacheKey() + "#" + settings.tokenLogin().tokenTtlSeconds();
    }

    private String login(ApiConnectionSettings settings) throws IOException {
        ApiTokenLogin login = settings.tokenLogin();
        URI target = ExternalApiPaths.resolve(settings.baseUri(), login.loginPath());

        HttpRequest.Builder request =
                HttpRequest.newBuilder(target)
                        .timeout(Duration.ofSeconds(settings.timeoutSeconds()))
                        .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                        .POST(
                                HttpRequest.BodyPublishers.ofByteArray(
                                        objectMapper.writeValueAsBytes(login.loginBody())));
        login.loginHeaders().forEach(request::header);

        ExternalApiCaller.Response response =
                ExternalApiCaller.send(httpClient, request.build(), target);
        if (!response.isSuccess()) {
            // Deliberately does not echo the body: a login failure response can repeat the
            // credentials back, and this message reaches the run log.
            throw new IOException(
                    "Login to "
                            + target.getHost()
                            + login.loginPath()
                            + " returned HTTP "
                            + response.status());
        }
        try {
            String token = login.extractToken(response, objectMapper);
            log.debug("[external-api] obtained a token from {}", target.getHost());
            return token;
        } catch (IllegalStateException e) {
            throw new IOException(e.getMessage(), e);
        }
    }

    /** The auth header for an authenticated call. */
    Map.Entry<String, String> authHeader(ApiConnectionSettings settings) throws IOException {
        return settings.tokenLogin().authHeader(token(settings));
    }
}
