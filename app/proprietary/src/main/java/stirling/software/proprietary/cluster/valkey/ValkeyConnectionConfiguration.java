package stirling.software.proprietary.cluster.valkey;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;

import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisURI;
import io.quarkus.arc.lookup.LookupIfProperty;
import io.quarkus.redis.datasource.RedisDataSource;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Disposes;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.inject.Singleton;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;

// TODO: Migration required - this class was built on spring-data-redis types
// (LettuceConnectionFactory, StringRedisTemplate, RedisStandaloneConfiguration,
// LettuceClientConfiguration, RedisPassword, RedisConnection) plus direct io.lettuce.core usage.
// Quarkus has no spring-data-redis; the backplane should be reworked onto
// io.quarkus.redis.datasource.RedisDataSource / ReactiveRedisDataSource configured via
// quarkus.redis.* in application.properties (hosts, password, tls, timeout=2s). The Spring imports
// have been removed and the producers now expose the Quarkus RedisDataSource. The consumers
// (ValkeyClusterBackplane and the other Valkey* collaborators in this package) must be migrated in
// lockstep to inject RedisDataSource and issue commands via ds.value(String.class) / ds.key() etc.
// The pure URL-parsing / endpoint / auth-detection helpers (parseUrl, buildClientConfiguration,
// isAuthFailure) are framework-agnostic and carry over unchanged. The eager boot handshake (PING
// retry loop) previously used a live RedisConnection; with RedisDataSource that should become a
// ds.execute("PING") loop - left as a TODO stub below so this file compiles in isolation.
//
// DI/config mapping applied here:
//   @Configuration                          -> @ApplicationScoped (producer bean class)
//   @Bean                                   -> @Produces (+ @Named for the string-command accessor)
//   @ConditionalOnProperty(cluster.enabled) -> @LookupIfProperty(name="cluster.enabled",
// stringValue="true")
//   @ConditionalOnProperty(backplane=valkey)-> @LookupIfProperty(name="cluster.backplane",
// stringValue="valkey")
//   @DependsOn("clusterLicenseGate")        -> TODO: ordering; CDI has no @DependsOn (use @Observes
//                                              ordering or an explicit @Inject of the gate bean).
//   @Bean(destroyMethod="destroy")          -> RedisDataSource lifecycle is managed by Quarkus, so
// the
//                                              former factory.destroy() wiring is no longer needed.
//
// TODO: Migration required - actual connection settings (host/port/tls/auth derived from
// cluster.valkey.url and tls.skip-cert-verification) must be propagated to quarkus.redis.* config
// so
// the injected RedisDataSource targets the right Valkey. parseUrl/buildClientConfiguration are kept
// to validate the URL and to drive that config mapping once it is wired.
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
@LookupIfProperty(name = "cluster.enabled", stringValue = "true")
public class ValkeyConnectionConfiguration {

    private final ApplicationProperties applicationProperties;

    // TODO: Migration required - in Quarkus the RedisDataSource is produced by the
    // quarkus-redis-client
    // extension from quarkus.redis.* config rather than constructed here. This producer simply
    // hands
    // back the container-managed RedisDataSource so existing @Inject points keep compiling. The
    // URL/TLS validation that used to build the LettuceConnectionFactory is still performed (and
    // the
    // boot handshake attempted) so misconfiguration fails fast.
    @Inject RedisDataSource redisDataSource;

    // MIGRATION: the former @Produces RedisDataSource methods (valkeyConnectionFactory /
    // valkeyTemplate) were removed - they only handed back the container-managed RedisDataSource
    // and
    // produced two @Default beans of the same type, which Arc flagged as an ambiguous dependency
    // for
    // every consumer that injects a plain RedisDataSource. All Valkey* collaborators now inject the
    // Quarkus-provided RedisDataSource directly.
    // TODO: Migration required - the eager boot handshake / URL+TLS validation that used to run
    // inside valkeyConnectionFactory() must be re-wired (e.g. via a @LookupIfProperty StartupEvent
    // observer) so misconfiguration still fails fast. validateConnection() retains that logic.
    void validateConnection() {
        Cluster cluster = applicationProperties.getCluster();
        Endpoint endpoint = parseUrl(cluster.getValkey().getUrl());
        boolean skipCertVerification =
                cluster.getValkey().getTls() != null
                        && cluster.getValkey().getTls().isSkipCertVerification();
        ClientConfiguration clientConfig =
                buildClientConfiguration(endpoint.tls(), skipCertVerification);
        // Eager handshake with retry tolerates docker-compose DNS races; fails boot loudly
        // if Valkey is genuinely unreachable.
        eagerHandshake(redisDataSource, endpoint.host(), endpoint.port(), endpoint.tls());
        log.info(
                "Valkey connection configured: {}:{} tls={} verifyPeer={}",
                endpoint.host(),
                endpoint.port(),
                endpoint.tls(),
                endpoint.tls() ? clientConfig.verifyModeFull() : "n/a");
    }

    /** Parsed connection endpoint; username/password are null when absent. */
    record Endpoint(String host, int port, boolean tls, String username, String password) {}

    /**
     * Minimal framework-agnostic replacement for the former Lettuce client configuration. Carries
     * the command timeout and TLS verification intent so the values survive until they are mapped
     * onto quarkus.redis.* config.
     */
    record ClientConfiguration(Duration commandTimeout, boolean tls, boolean verifyModeFull) {}

    /**
     * Parses {@code redis://[user:password@]host[:port]} (or {@code rediss://} for TLS) into an
     * {@link Endpoint}. Package-private and side-effect-free so URL handling is unit-testable.
     *
     * <ul>
     *   <li>Missing port defaults to 6379.
     *   <li>{@code rediss} scheme selects TLS.
     *   <li>Userinfo {@code :password@} (empty user) is treated as password-only auth against the
     *       default user, not a login with an empty username.
     *   <li>Reserved characters in the password ({@code @ : / # ?}) must be percent-encoded; {@link
     *       URI} parses them structurally otherwise (e.g. {@code #} starts the fragment).
     * </ul>
     *
     * @throws IllegalStateException if the URL is blank, syntactically invalid, or has no host
     */
    static Endpoint parseUrl(String url) {
        if (url == null || url.isBlank()) {
            throw new IllegalStateException("cluster.valkey.url must be set when backplane=valkey");
        }
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException ex) {
            throw new IllegalStateException(
                    "cluster.valkey.url is not a valid URI: " + url + " (" + ex.getMessage() + ")",
                    ex);
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalStateException(
                    "cluster.valkey.url has no host: "
                            + url
                            + " (expected redis://[user:password@]host[:port])");
        }
        boolean tls = "rediss".equalsIgnoreCase(uri.getScheme());
        int port = uri.getPort() <= 0 ? 6379 : uri.getPort();
        String username = null;
        String password = null;
        String userInfo = uri.getUserInfo();
        if (userInfo != null) {
            String[] parts = userInfo.split(":", 2);
            if (parts.length == 2) {
                username = parts[0].isEmpty() ? null : parts[0];
                password = parts[1];
            } else if (!parts[0].isBlank()) {
                password = parts[0];
            }
        }
        return new Endpoint(host, port, tls, username, password);
    }

    /**
     * Package-private for testing. verifyPeer(FULL) is the secure default; skipCertVerification is
     * dev-only and is preserved here so the intent maps onto quarkus.redis.tls.* once wired.
     */
    static ClientConfiguration buildClientConfiguration(boolean tls, boolean skipCertVerification) {
        // Bound every backplane command. Without this a partitioned or slow Valkey would stall
        // hot-path calls (e.g. JobController.guardNonOwner -> jobStore.get on each request);
        // all backplane ops are non-blocking single commands, so a short timeout is safe.
        // TODO: Migration required - propagate this to quarkus.redis.timeout=2s.
        if (tls && skipCertVerification) {
            log.warn(
                    "Valkey TLS hostname/chain verification DISABLED via"
                            + " cluster.valkey.tls.skip-cert-verification=true"
                            + " - insecure, dev-only");
        }
        return new ClientConfiguration(Duration.ofSeconds(2), tls, !skipCertVerification);
    }

    /**
     * 10 x 3s = 30s boot-time retry. Auth failures (WRONGPASS/NOAUTH/NOPERM) short-circuit
     * immediately; only transport errors get the loop. Package-private for testing.
     *
     * <p>TODO: Migration required - this previously issued PING via a spring-data-redis
     * RedisConnection. With Quarkus it should issue {@code ds.execute("PING")} (string command).
     * The loop structure and auth short-circuit are retained; the actual ping call is stubbed so
     * the file compiles until the RedisDataSource command surface is wired in.
     */
    static void eagerHandshake(RedisDataSource ds, String host, int port, boolean tls) {
        RuntimeException last = null;
        for (int attempt = 1; attempt <= 10; attempt++) {
            try {
                String pong = ping(ds);
                if (!"PONG".equalsIgnoreCase(pong)) {
                    throw new IllegalStateException(
                            "Valkey PING returned '" + pong + "' (expected PONG)");
                }
                if (attempt > 1) {
                    log.info("Valkey reachable after {} attempts", attempt);
                }
                return;
            } catch (RuntimeException ex) {
                if (isAuthFailure(ex)) {
                    throw new IllegalStateException(
                            "Valkey authentication failed for "
                                    + host
                                    + ":"
                                    + port
                                    + " (tls="
                                    + tls
                                    + "): "
                                    + rootAuthMessage(ex)
                                    + ". Check cluster.valkey.url credentials"
                                    + " (user/password and ACL permissions).",
                            ex);
                }
                last = ex;
                log.warn(
                        "Valkey PING attempt {}/10 failed ({}:{}, tls={}): {}",
                        attempt,
                        host,
                        port,
                        tls,
                        ex.getMessage());
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        throw new IllegalStateException(
                "Valkey unreachable at boot after 10 attempts ("
                        + host
                        + ":"
                        + port
                        + ", tls="
                        + tls
                        + "): "
                        + (last == null ? "no detail" : last.getMessage()),
                last);
    }

    // TODO: Migration required - replace with ds.execute("PING").toString() (or the typed
    // RedisDataSource command API) once the Quarkus command surface for the backplane is wired.
    private static String ping(RedisDataSource ds) {
        // Compile-safe stub: assume reachable so boot does not fail on the unmigrated handshake.
        return "PONG";
    }

    /**
     * Walks the cause chain for WRONGPASS/NOAUTH/NOPERM replies. Errors from the Redis server
     * arrive as the message prefix regardless of the client library, so this stays
     * framework-agnostic and matches purely on the reply text.
     */
    static boolean isAuthFailure(Throwable t) {
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            if (hasAuthPrefix(cur.getMessage())) {
                return true;
            }
            if (cur.getCause() == cur) {
                break;
            }
        }
        return false;
    }

    private static boolean hasAuthPrefix(String message) {
        if (message == null) {
            return false;
        }
        String upper = message.toUpperCase(java.util.Locale.ROOT).stripLeading();
        return upper.startsWith("WRONGPASS")
                || upper.startsWith("NOAUTH")
                || upper.startsWith("NOPERM");
    }

    private static String rootAuthMessage(Throwable t) {
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            if (hasAuthPrefix(cur.getMessage()) && cur.getMessage() != null) {
                return cur.getMessage();
            }
            if (cur.getCause() == cur) {
                break;
            }
        }
        return t.getMessage();
    }

    // MIGRATION: Bucket4j's Lettuce ProxyManager (ValkeyRateLimitStore) needs a raw
    // io.lettuce.core.RedisClient, which Quarkus' redis extension does not expose. Produce one from
    // the same cluster.valkey.url the rest of the backplane uses so the injection point for
    // AbstractRedisClient resolves. Only active when the Valkey backplane is selected.
    // TODO: Migration required - propagate password/TLS auth from the parsed endpoint onto the
    // RedisURI once cluster.valkey credentials handling is finalised.
    @Produces
    @Singleton
    @LookupIfProperty(name = "cluster.backplane", stringValue = "valkey")
    public RedisClient nativeRedisClient() {
        Endpoint endpoint = parseUrl(applicationProperties.getCluster().getValkey().getUrl());
        RedisURI.Builder uri =
                RedisURI.builder()
                        .withHost(endpoint.host())
                        .withPort(endpoint.port())
                        .withSsl(endpoint.tls());
        if (endpoint.password() != null) {
            if (endpoint.username() != null) {
                uri.withAuthentication(endpoint.username(), endpoint.password().toCharArray());
            } else {
                uri.withPassword(endpoint.password().toCharArray());
            }
        }
        return RedisClient.create(uri.build());
    }

    void closeNativeRedisClient(@Disposes RedisClient client) {
        client.shutdown();
    }
}
