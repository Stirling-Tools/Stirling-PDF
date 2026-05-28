package stirling.software.proprietary.cluster.valkey;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.SslVerifyMode;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;

@Slf4j
@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(name = "cluster.enabled", havingValue = "true")
@DependsOn("clusterLicenseGate")
public class ValkeyConnectionConfiguration {

    private final ApplicationProperties applicationProperties;

    @Bean(destroyMethod = "destroy")
    @ConditionalOnProperty(name = "cluster.backplane", havingValue = "valkey")
    public LettuceConnectionFactory valkeyConnectionFactory() {
        Cluster cluster = applicationProperties.getCluster();
        String url = cluster.getValkey().getUrl();
        if (url == null || url.isBlank()) {
            throw new IllegalStateException("cluster.valkey.url must be set when backplane=valkey");
        }
        URI uri = URI.create(url);
        boolean tls = "rediss".equalsIgnoreCase(uri.getScheme());
        int port = uri.getPort() <= 0 ? 6379 : uri.getPort();
        RedisStandaloneConfiguration cfg = new RedisStandaloneConfiguration(uri.getHost(), port);
        if (uri.getUserInfo() != null) {
            String[] parts = uri.getUserInfo().split(":", 2);
            if (parts.length == 2) {
                cfg.setUsername(parts[0]);
                cfg.setPassword(RedisPassword.of(parts[1]));
            } else if (parts.length == 1 && !parts[0].isBlank()) {
                cfg.setPassword(RedisPassword.of(parts[0]));
            }
        }
        boolean skipCertVerification =
                cluster.getValkey().getTls() != null
                        && cluster.getValkey().getTls().isSkipCertVerification();
        LettuceClientConfiguration clientConfig =
                buildClientConfiguration(tls, skipCertVerification);
        LettuceConnectionFactory factory = new LettuceConnectionFactory(cfg, clientConfig);
        factory.afterPropertiesSet();
        // Eager handshake with retry tolerates docker-compose DNS races; fails boot loudly
        // if Valkey is genuinely unreachable.
        eagerHandshake(factory, uri.getHost(), port, tls);
        log.info(
                "Valkey connection configured: {}:{} tls={} verifyPeer={}",
                uri.getHost(),
                port,
                tls,
                tls ? clientConfig.getVerifyMode() : "n/a");
        return factory;
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
                String pong = factory.getConnection().ping();
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

    @Bean
    @ConditionalOnProperty(name = "cluster.backplane", havingValue = "valkey")
    public StringRedisTemplate valkeyTemplate(LettuceConnectionFactory factory) {
        return new StringRedisTemplate(factory);
    }
}
