package stirling.software.proprietary.cluster.valkey;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;

import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.SslVerifyMode;

import io.quarkus.arc.lookup.LookupIfProperty;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Named;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;

// TODO: Migration required - this class still depends on spring-data-redis types
// (LettuceConnectionFactory, StringRedisTemplate, RedisStandaloneConfiguration,
// LettuceClientConfiguration, RedisPassword, RedisConnection). Quarkus has no spring-data-redis;
// the backplane should be reworked onto io.quarkus.redis.datasource.RedisDataSource /
// ReactiveRedisDataSource configured via quarkus.redis.* in application.properties (hosts, password,
// tls, timeout=2s). The produced beans below are consumed by ValkeyClusterBackplane and the other
// Valkey* collaborators in this package; migrating this file requires migrating those consumers in
// lockstep, so the spring-data-redis imports are retained until that coordinated change lands. The
// pure URL-parsing / handshake / auth-detection helpers (parseUrl, buildClientConfiguration,
// eagerHandshake, isAuthFailure) are framework-agnostic and carry over unchanged.
//
// DI/config mapping applied here:
//   @Configuration                         -> @ApplicationScoped (producer bean class)
//   @Bean                                  -> @Produces (+ @Named for the StringRedisTemplate)
//   @ConditionalOnProperty(cluster.enabled)-> @LookupIfProperty(name="cluster.enabled", stringValue="true")
//   @ConditionalOnProperty(backplane=valkey)-> @LookupIfProperty(name="cluster.backplane", stringValue="valkey")
//   @DependsOn("clusterLicenseGate")       -> TODO: ordering; ensure clusterLicenseGate runs first
//                                             (CDI has no @DependsOn; use @Observes ordering or an
//                                             explicit @Inject of the gate bean once migrated).
//   @Bean(destroyMethod="destroy")         -> @PreDestroy on the produced instance is not expressible
//                                             on a @Produces method here; rely on factory.destroy()
//                                             already wired via Spring's destroy lifecycle until the
//                                             RedisDataSource migration removes this bean. TODO.
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
@LookupIfProperty(name = "cluster.enabled", stringValue = "true")
public class ValkeyConnectionConfiguration {

    private final ApplicationProperties applicationProperties;

    // TODO: Migration required - replace LettuceConnectionFactory with a configured
    // io.quarkus.redis.datasource.RedisDataSource (quarkus.redis.* config). destroyMethod="destroy"
    // has no @Produces equivalent without a @Disposes method; keep factory.destroy() lifecycle until
    // the RedisDataSource migration.
    @Produces
    @LookupIfProperty(name = "cluster.backplane", stringValue = "valkey")
    public LettuceConnectionFactory valkeyConnectionFactory() {
        Cluster cluster = applicationProperties.getCluster();
        Endpoint endpoint = parseUrl(cluster.getValkey().getUrl());
        RedisStandaloneConfiguration cfg =
                new RedisStandaloneConfiguration(endpoint.host(), endpoint.port());
        if (endpoint.username() != null) {
            cfg.setUsername(endpoint.username());
        }
        if (endpoint.password() != null) {
            cfg.setPassword(RedisPassword.of(endpoint.password()));
        }
        boolean skipCertVerification =
                cluster.getValkey().getTls() != null
                        && cluster.getValkey().getTls().isSkipCertVerification();
        LettuceClientConfiguration clientConfig =
                buildClientConfiguration(endpoint.tls(), skipCertVerification);
        LettuceConnectionFactory factory = new LettuceConnectionFactory(cfg, clientConfig);
        factory.afterPropertiesSet();
        // Eager handshake with retry tolerates docker-compose DNS races; fails boot loudly
        // if Valkey is genuinely unreachable.
        eagerHandshake(factory, endpoint.host(), endpoint.port(), endpoint.tls());
        log.info(
                "Valkey connection configured: {}:{} tls={} verifyPeer={}",
                endpoint.host(),
                endpoint.port(),
                endpoint.tls(),
                endpoint.tls() ? clientConfig.getVerifyMode() : "n/a");
        return factory;
    }

    /** Parsed connection endpoint; username/password are null when absent. */
    record Endpoint(String host, int port, boolean tls, String username, String password) {}

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
     * Package-private for testing. verifyPeer(FULL) is pinned explicitly so a Spring Data Redis
     * default change cannot silently weaken our TLS handshake. skipCertVerification is dev-only.
     */
    static LettuceClientConfiguration buildClientConfiguration(
            boolean tls, boolean skipCertVerification) {
        LettuceClientConfiguration.LettuceClientConfigurationBuilder clientBuilder =
                LettuceClientConfiguration.builder();
        // Bound every backplane command. Lettuce defaults to 60s; without this a partitioned or
        // slow Valkey would stall hot-path calls (e.g. JobController.guardNonOwner -> jobStore.get
        // on each request) for up to a minute, exhausting request threads. All backplane ops are
        // non-blocking single commands, so a short timeout is safe.
        clientBuilder.commandTimeout(Duration.ofSeconds(2));
        if (tls) {
            clientBuilder
                    .useSsl()
                    .verifyPeer(skipCertVerification ? SslVerifyMode.NONE : SslVerifyMode.FULL);
            if (skipCertVerification) {
                log.warn(
                        "Valkey TLS hostname/chain verification DISABLED via"
                                + " cluster.valkey.tls.skip-cert-verification=true"
                                + " - insecure, dev-only");
            }
        }
        return clientBuilder.build();
    }

    /**
     * 10 x 3s = 30s boot-time retry. Auth failures (WRONGPASS/NOAUTH/NOPERM) short-circuit
     * immediately; only transport errors get the loop. Package-private for testing.
     */
    static void eagerHandshake(
            LettuceConnectionFactory factory, String host, int port, boolean tls) {
        RuntimeException last = null;
        for (int attempt = 1; attempt <= 10; attempt++) {
            try {
                String pong;
                RedisConnection conn = factory.getConnection();
                try {
                    pong = conn.ping();
                } finally {
                    conn.close();
                }
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
                    factory.destroy();
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
        factory.destroy();
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

    /**
     * Walks the cause chain for WRONGPASS/NOAUTH/NOPERM replies. Spring Data Redis wraps Lettuce's
     * RedisCommandExecutionException in RedisSystemException, so the auth signal may be one level
     * down. No typed auth exception exists in spring-data-redis 4.0.5 / Lettuce 6.8.2.
     */
    static boolean isAuthFailure(Throwable t) {
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            if (cur instanceof RedisCommandExecutionException && hasAuthPrefix(cur.getMessage())) {
                return true;
            }
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
            if (cur instanceof RedisCommandExecutionException && cur.getMessage() != null) {
                return cur.getMessage();
            }
            if (cur.getCause() == cur) {
                break;
            }
        }
        return t.getMessage();
    }

    // TODO: Migration required - StringRedisTemplate is spring-data-redis. Once the connection
    // migrates to RedisDataSource, this producer should be removed and consumers should inject the
    // Quarkus RedisDataSource (string commands via redisDataSource.value(String.class)) directly.
    @Produces
    @Named("valkeyTemplate")
    @LookupIfProperty(name = "cluster.backplane", stringValue = "valkey")
    public StringRedisTemplate valkeyTemplate(LettuceConnectionFactory factory) {
        return new StringRedisTemplate(factory);
    }
}
