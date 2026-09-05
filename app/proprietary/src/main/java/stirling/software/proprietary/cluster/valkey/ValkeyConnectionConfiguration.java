package stirling.software.proprietary.cluster.valkey;

import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.data.redis.connection.ClusterInfo;
import org.springframework.data.redis.connection.RedisClusterCommandsProvider;
import org.springframework.data.redis.connection.RedisClusterConfiguration;
import org.springframework.data.redis.connection.RedisConfiguration;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisSentinelConfiguration;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettucePoolingClientConfiguration;
import org.springframework.data.redis.core.StringRedisTemplate;

import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.SslVerifyMode;
import io.lettuce.core.api.StatefulConnection;
import io.lettuce.core.cluster.ClusterClientOptions;
import io.lettuce.core.cluster.ClusterTopologyRefreshOptions;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.HostPort;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;
import stirling.software.common.model.ApplicationProperties.Cluster.Valkey;

@Slf4j
@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(name = "cluster.enabled", havingValue = "true")
@DependsOn("clusterLicenseGate")
public class ValkeyConnectionConfiguration {

    /** Command name in a NOPERM reply; the key-permission variant quotes nothing. */
    private static final java.util.regex.Pattern NOPERM_COMMAND =
            java.util.regex.Pattern.compile("run the '([^']+)'");

    /** Valkey rejects a client name outside printable ASCII, space included, during HELLO. */
    private static final java.util.regex.Pattern UNSAFE_CLIENT_NAME =
            java.util.regex.Pattern.compile("[^\\x21-\\x7e]");

    private static final int BOOT_PROBE_ATTEMPTS = 10;

    private final ApplicationProperties applicationProperties;

    @Bean(destroyMethod = "destroy")
    @ConditionalOnProperty(name = "cluster.backplane", havingValue = "valkey")
    public LettuceConnectionFactory valkeyConnectionFactory() {
        Cluster cluster = applicationProperties.getCluster();
        Valkey valkey = cluster.getValkey();
        Valkey.ValkeyMode mode = valkey.resolvedMode();
        // Only standalone reads the URL; sentinel/cluster take endpoints and credentials from
        // their own properties so there is one obvious source of truth per mode.
        Endpoint endpoint = mode == Valkey.ValkeyMode.STANDALONE ? parseUrl(valkey.getUrl()) : null;
        Valkey.Tls tlsProps = valkey.getTls();
        // tls.enabled is OR-ed with the url scheme, never overridden by it.
        boolean tls = tlsProps.isEnabled() || (endpoint != null && endpoint.tls());
        guardIgnoredUrl(valkey, mode, tls);
        String username =
                firstNonBlank(valkey.getUsername(), endpoint == null ? null : endpoint.username());
        String password =
                firstNonBlank(valkey.getPassword(), endpoint == null ? null : endpoint.password());
        String clientName = resolveClientName(cluster);

        LettuceClientConfiguration clientConfig =
                buildClientConfiguration(
                        tls,
                        tlsProps.isSkipCertVerification(),
                        clientName,
                        Duration.ofMillis(valkey.getCommandTimeoutMs()),
                        valkey.getPool(),
                        mode,
                        Duration.ofMillis(valkey.getTopologyRefreshMs()));

        LettuceConnectionFactory factory =
                switch (mode) {
                    case STANDALONE ->
                            new LettuceConnectionFactory(
                                    standaloneConfiguration(endpoint, username, password),
                                    clientConfig);
                    case SENTINEL ->
                            new LettuceConnectionFactory(
                                    sentinelConfiguration(valkey, username, password),
                                    clientConfig);
                    case CLUSTER ->
                            new LettuceConnectionFactory(
                                    clusterConfiguration(valkey, username, password), clientConfig);
                };
        factory.afterPropertiesSet();
        // Eager handshake with retry tolerates docker-compose DNS races; fails boot loudly
        // if Valkey is genuinely unreachable.
        String target = describeTarget(mode, endpoint, valkey);
        eagerHandshake(factory, target, tls, mode == Valkey.ValkeyMode.CLUSTER, clientName);
        log.info(
                "Valkey connection configured: mode={} endpoints={} tls={} verifyPeer={} pooled={}"
                        + " clientName={}",
                mode,
                target,
                tls,
                tls ? clientConfig.getVerifyMode() : "n/a",
                valkey.getPool().isEnabled(),
                clientName == null ? "disabled (no CLIENT SETNAME)" : clientName);
        return factory;
    }

    /**
     * Sentinel/cluster ignore {@code cluster.valkey.url}; a dropped {@code rediss://} would
     * silently downgrade TLS to plaintext, so that combination refuses boot (userinfo only warns).
     */
    static void guardIgnoredUrl(Valkey valkey, Valkey.ValkeyMode mode, boolean tls) {
        if (mode == Valkey.ValkeyMode.STANDALONE || !isSet(valkey.getUrl())) {
            return;
        }
        URI uri;
        try {
            uri = new URI(valkey.getUrl().trim());
        } catch (URISyntaxException ex) {
            log.warn("cluster.valkey.url is ignored in {} mode and is not a valid URI", mode);
            return;
        }
        if (!tls && "rediss".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalStateException(
                    "cluster.valkey.url uses rediss:// (TLS) but cluster.valkey.mode="
                            + mode.name().toLowerCase(java.util.Locale.ROOT)
                            + " ignores the url and cluster.valkey.tls.enabled is false. Refusing"
                            + " to connect in plaintext. Set cluster.valkey.tls.enabled=true, or"
                            + " clear cluster.valkey.url if plaintext is intended.");
        }
        if (isSet(uri.getUserInfo())) {
            log.warn(
                    "cluster.valkey.url carries credentials but mode={} ignores the url - set"
                            + " cluster.valkey.username/password (and sentinel.password) instead",
                    mode);
        }
        int database = databaseOrZero(uri.getPath());
        if (database != 0) {
            log.warn(
                    "cluster.valkey.url selects database {} but mode={} ignores the url - this"
                            + " deployment will use database 0",
                    database,
                    mode);
        }
    }

    static RedisStandaloneConfiguration standaloneConfiguration(
            Endpoint endpoint, String username, String password) {
        RedisStandaloneConfiguration cfg =
                new RedisStandaloneConfiguration(endpoint.host(), endpoint.port());
        // The database is the only isolation between two deployments sharing one Valkey.
        cfg.setDatabase(endpoint.database());
        applyAuth(cfg, username, password);
        return cfg;
    }

    static RedisSentinelConfiguration sentinelConfiguration(
            Valkey valkey, String username, String password) {
        RedisSentinelConfiguration cfg = new RedisSentinelConfiguration();
        cfg.master(valkey.getSentinel().getMaster().trim());
        for (String node : valkey.getSentinel().getNodes()) {
            HostPort e = HostPort.parse(node, "cluster.valkey.sentinel.nodes", "sentinel-1:26379");
            cfg.sentinel(e.host(), e.port());
        }
        applyAuth(cfg, username, password);
        // Sentinel AUTH is separate from data-node AUTH - the commonest sentinel misconfiguration.
        if (isSet(valkey.getSentinel().getUsername())) {
            cfg.setSentinelUsername(valkey.getSentinel().getUsername());
        }
        if (isSet(valkey.getSentinel().getPassword())) {
            cfg.setSentinelPassword(RedisPassword.of(valkey.getSentinel().getPassword()));
        }
        return cfg;
    }

    static RedisClusterConfiguration clusterConfiguration(
            Valkey valkey, String username, String password) {
        RedisClusterConfiguration cfg = new RedisClusterConfiguration();
        for (String node : valkey.getNodes()) {
            HostPort e = HostPort.parse(node, "cluster.valkey.nodes", "valkey-1:6379");
            cfg.clusterNode(e.host(), e.port());
        }
        cfg.setMaxRedirects(valkey.getMaxRedirects());
        applyAuth(cfg, username, password);
        return cfg;
    }

    private static void applyAuth(
            RedisConfiguration.WithAuthentication cfg, String username, String password) {
        if (username != null) {
            cfg.setUsername(username);
        }
        if (password != null) {
            cfg.setPassword(RedisPassword.of(password));
        }
    }

    /** Parsed connection endpoint; username/password are null when absent. */
    record Endpoint(
            String host, int port, boolean tls, String username, String password, int database) {}

    /**
     * Reserved chars in the password ({@code @ : / # ?}) must be percent-encoded - {@link URI}
     * otherwise parses them structurally (e.g. {@code #} starts the fragment).
     */
    static Endpoint parseUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new IllegalStateException("cluster.valkey.url must be set when backplane=valkey");
        }
        // A .env line or YAML block scalar leaves a trailing newline that URI rejects.
        String url = rawUrl.trim();
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException ex) {
            // Never attach ex: its own message echoes the url, credentials included.
            throw new IllegalStateException(
                    "cluster.valkey.url is not a valid URI: "
                            + redactUserInfo(url)
                            + " ("
                            + ex.getReason()
                            + (ex.getIndex() >= 0 ? " at index " + ex.getIndex() : "")
                            + ")");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalStateException(
                    "cluster.valkey.url has no host: "
                            + redactUserInfo(url)
                            + " (expected redis://[user:password@]host[:port][/database])");
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
        int database;
        try {
            database = parseDatabaseSegment(uri.getPath());
        } catch (NumberFormatException ex) {
            throw new IllegalStateException(
                    "cluster.valkey.url has an invalid database index: "
                            + redactUserInfo(url)
                            + " (the path must be a non-negative integer, e.g."
                            + " redis://valkey:6379/2)");
        }
        return new Endpoint(host, port, tls, username, password, database);
    }

    /**
     * Spring Boot's {@code spring.data.redis.url} reads the path as the database index, so an
     * operator copying that syntax must not be silently downgraded to database 0.
     */
    private static int parseDatabaseSegment(String path) {
        if (path == null || path.isBlank() || "/".equals(path)) {
            return 0;
        }
        int database = Integer.parseInt(path.startsWith("/") ? path.substring(1) : path);
        if (database < 0) {
            throw new NumberFormatException("negative database index " + database);
        }
        return database;
    }

    /** Lenient variant: the ignored-url guard must never fail boot over an unused database. */
    private static int databaseOrZero(String path) {
        try {
            return parseDatabaseSegment(path);
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    /**
     * Masks {@code user:password@} so a url can be named in an error. Bounded to the authority: an
     * unbounded lastIndexOf('@') would mangle {@code redis://valkey:6379/0?tag=a@b}.
     */
    static String redactUserInfo(String url) {
        if (url == null) {
            return null;
        }
        int slashes = url.indexOf("//");
        if (slashes < 0) {
            return url;
        }
        int start = slashes + 2;
        int end = url.length();
        for (int i = start; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c == '/' || c == '?' || c == '#') {
                end = i;
                break;
            }
        }
        int at = end == start ? -1 : url.lastIndexOf('@', end - 1);
        if (at < start) {
            return url;
        }
        return url.substring(0, start) + "****" + url.substring(at);
    }

    /**
     * Package-private for testing. verifyPeer(FULL) is pinned explicitly so a Spring Data Redis
     * default change cannot silently weaken our TLS handshake. skipCertVerification is dev-only.
     */
    static LettuceClientConfiguration buildClientConfiguration(
            boolean tls,
            boolean skipCertVerification,
            String clientName,
            Duration commandTimeout,
            Valkey.Pool pool,
            Valkey.ValkeyMode mode,
            Duration topologyRefresh) {
        LettuceClientConfiguration.LettuceClientConfigurationBuilder clientBuilder;
        if (pool.isEnabled()) {
            // poolConfig() MUST be called before useSsl(): the SSL sub-builder's static type is the
            // non-pooling one, so chaining it after would not compile.
            clientBuilder =
                    LettucePoolingClientConfiguration.builder().poolConfig(toPoolConfig(pool));
        } else {
            clientBuilder = LettuceClientConfiguration.builder();
        }
        // Lettuce defaults to 60s; unbounded, a slow Valkey stalls hot-path calls and exhausts
        // request threads. All backplane ops are single non-blocking commands, so short is safe.
        clientBuilder.commandTimeout(commandTimeout);
        // CLIENT SETNAME attributes load per node; null = opted out (see resolveClientName).
        if (clientName != null) {
            clientBuilder.clientName(clientName);
        }
        if (mode == Valkey.ValkeyMode.CLUSTER) {
            // Must be ClusterClientOptions: spring-data filters on that type, and anything else
            // is dropped along with our topology refresh settings.
            clientBuilder.clientOptions(clusterClientOptions(topologyRefresh));
        }
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

    static GenericObjectPoolConfig<StatefulConnection<?, ?>> toPoolConfig(Valkey.Pool pool) {
        GenericObjectPoolConfig<StatefulConnection<?, ?>> cfg = new GenericObjectPoolConfig<>();
        cfg.setMaxTotal(pool.getMaxActive());
        cfg.setMaxIdle(pool.getMaxIdle());
        cfg.setMinIdle(pool.getMinIdle());
        cfg.setMaxWait(Duration.ofMillis(pool.getMaxWaitMillis()));
        // Local isOpen() check, no round trip: it only rejects already-closed connections. Lettuce
        // auto-reconnect means a stale post-failover connection can still report open and be lent.
        cfg.setTestOnBorrow(pool.isTestOnBorrow());
        cfg.setTestWhileIdle(false);
        // minIdle and idle eviction are inert unless the evictor thread actually runs.
        cfg.setTimeBetweenEvictionRuns(Duration.ofMillis(pool.getTimeBetweenEvictionRunsMillis()));
        cfg.setJmxEnabled(false);
        return cfg;
    }

    static ClusterClientOptions clusterClientOptions(Duration topologyRefresh) {
        // Without adaptive triggers the client keeps hammering a demoted master for up to a
        // full refresh period after a failover; periodic refresh alone is not enough.
        ClusterTopologyRefreshOptions topology =
                ClusterTopologyRefreshOptions.builder()
                        .enablePeriodicRefresh(topologyRefresh)
                        .enableAllAdaptiveRefreshTriggers()
                        .adaptiveRefreshTriggersTimeout(topologyRefresh)
                        .dynamicRefreshSources(true)
                        .closeStaleConnections(true)
                        .build();
        return ClusterClientOptions.builder()
                .topologyRefreshOptions(topology)
                .validateClusterNodeMembership(true)
                .build();
    }

    /**
     * Blank = {@code stirling-} + node name; off/none/disabled = null. A missing SETNAME ACL
     * refuses nothing (RESP3 folds it into HELLO, RESP2 swallows it); a name Valkey rejects does.
     */
    static String resolveClientName(Cluster cluster) {
        String configured = cluster.getValkey().getClientName();
        if (!isSet(configured)) {
            return sanitiseClientName("stirling-" + cluster.resolvedNodeName(), "cluster.node.id");
        }
        String trimmed = configured.trim();
        return isClientNameOptOut(trimmed)
                ? null
                : sanitiseClientName(trimmed, "cluster.valkey.clientName");
    }

    private static String sanitiseClientName(String name, String source) {
        String safe = UNSAFE_CLIENT_NAME.matcher(name).replaceAll("-");
        if (!safe.equals(name)) {
            log.warn(
                    "Valkey client name from {} contains characters Valkey refuses in the"
                            + " handshake; using '{}' instead of '{}'",
                    source,
                    safe,
                    name);
        }
        return safe;
    }

    private static boolean isClientNameOptOut(String value) {
        String lower = value.toLowerCase(java.util.Locale.ROOT);
        return "off".equals(lower) || "none".equals(lower) || "disabled".equals(lower);
    }

    private static boolean isSet(String v) {
        return v != null && !v.isBlank();
    }

    private static String firstNonBlank(String preferred, String fallback) {
        if (isSet(preferred)) {
            return preferred;
        }
        return isSet(fallback) ? fallback : null;
    }

    static String describeTarget(Valkey.ValkeyMode mode, Endpoint endpoint, Valkey valkey) {
        return switch (mode) {
            // Database only when non-zero: the boot log stays host:port for the common case.
            case STANDALONE ->
                    endpoint.host()
                            + ":"
                            + endpoint.port()
                            + (endpoint.database() == 0 ? "" : "/" + endpoint.database());
            case SENTINEL ->
                    "sentinels="
                            + String.join(",", valkey.getSentinel().getNodes())
                            + " master="
                            + valkey.getSentinel().getMaster();
            case CLUSTER -> "nodes=" + String.join(",", valkey.getNodes());
        };
    }

    /**
     * 10 x 3s = 30s boot-time retry. Auth failures (WRONGPASS/NOAUTH/NOPERM) short-circuit
     * immediately; only transport errors get the loop. Package-private for testing.
     */
    static void eagerHandshake(
            LettuceConnectionFactory factory,
            String target,
            boolean tls,
            boolean clusterMode,
            String clientName) {
        // Single-key EXISTS, not PING: on Valkey Cluster spring-data fans PING out to EVERY node
        // and reports failure if any one is down, which would refuse boot on a healthy cluster.
        byte[] probeKey =
                ("stirling:health:boot:" + (clientName == null ? "unnamed" : clientName))
                        .getBytes(StandardCharsets.UTF_8);
        RuntimeException last = null;
        int attempt = 0;
        while (attempt < BOOT_PROBE_ATTEMPTS) {
            attempt++;
            try {
                RedisConnection conn = factory.getConnection();
                try {
                    if (conn.keyCommands().exists(probeKey) == null) {
                        throw new IllegalStateException("Valkey EXISTS probe returned no reply");
                    }
                    if (clusterMode) {
                        assertClusterServesSlots(conn);
                    }
                } finally {
                    conn.close();
                }
                if (attempt > 1) {
                    log.info("Valkey reachable after {} attempts", attempt);
                }
                return;
            } catch (RuntimeException ex) {
                if (isAuthFailure(ex)) {
                    factory.destroy();
                    throw new IllegalStateException(authFailureMessage(ex, target, tls), ex);
                }
                last = ex;
                log.warn(
                        "Valkey probe attempt {}/{} failed ({}, tls={}): {}",
                        attempt,
                        BOOT_PROBE_ATTEMPTS,
                        target,
                        tls,
                        ex.getMessage());
                // No backoff after the final attempt: it would only delay the throw below.
                if (attempt < BOOT_PROBE_ATTEMPTS) {
                    try {
                        Thread.sleep(3000);
                    } catch (InterruptedException ie) {
                        // Destroy first: an armed interrupt aborts Lettuce's shutdown await and
                        // leaks the client resources.
                        factory.destroy();
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException(
                                unreachableMessage(attempt, target, tls, last), last);
                    }
                }
            }
        }
        factory.destroy();
        throw new IllegalStateException(unreachableMessage(attempt, target, tls, last), last);
    }

    private static String unreachableMessage(
            int attempts, String target, boolean tls, RuntimeException last) {
        return "Valkey unreachable at boot after "
                + attempts
                + " attempts ("
                + target
                + ", tls="
                + tls
                + "): "
                + (last == null ? "no detail" : last.getMessage());
    }

    /**
     * A cluster answers commands long before it covers all 16384 slots; boot must wait for both.
     */
    private static void assertClusterServesSlots(RedisConnection conn) {
        if (!(conn instanceof RedisClusterCommandsProvider provider)) {
            throw new IllegalStateException(
                    "Expected a cluster connection but got " + conn.getClass().getName());
        }
        ClusterInfo info = provider.clusterCommands().clusterGetClusterInfo();
        if (info == null || !"ok".equalsIgnoreCase(String.valueOf(info.getState()))) {
            throw new IllegalStateException(
                    "Valkey cluster_state is not ok (cluster is not serving all slots yet)");
        }
        Long slotsOk = info.getSlotsOk();
        if (slotsOk != null && slotsOk < 16384L) {
            throw new IllegalStateException(
                    "Valkey cluster covers only " + slotsOk + "/16384 slots");
        }
    }

    /**
     * NOPERM means the credentials were accepted and the ACL user lacks a command or key
     * permission, so the message must not send operators hunting a password problem.
     */
    static String authFailureMessage(Throwable ex, String target, boolean tls) {
        String reply = rootAuthMessage(ex);
        String where = target + " (tls=" + tls + "): " + reply;
        if (!isPermissionFailure(ex)) {
            return "Valkey authentication failed for "
                    + where
                    + ". Check cluster.valkey credentials (username/password,"
                    + " sentinel.password).";
        }
        String command = refusedCommand(reply);
        return "Valkey ACL refused a command for "
                + where
                + ". The credentials were accepted; this ACL user is missing a command or key"
                + " permission"
                + (command == null ? "" : " - grant '+" + command + "'")
                + ". The backplane needs the boot probe (EXISTS) and read/write access to the"
                + " 'stirling:*' keyspace.";
    }

    /** NOPERM only - a permitted-command/key problem, distinct from bad credentials. */
    static boolean isPermissionFailure(Throwable t) {
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            if (startsWithToken(cur.getMessage(), "NOPERM")) {
                return true;
            }
            if (cur.getCause() == cur) {
                break;
            }
        }
        return false;
    }

    private static String refusedCommand(String reply) {
        if (reply == null) {
            return null;
        }
        java.util.regex.Matcher m = NOPERM_COMMAND.matcher(reply);
        return m.find() ? m.group(1) : null;
    }

    /**
     * WRONGPASS/NOAUTH/NOPERM are all unrecoverable at boot, so they share this fast-fail path. No
     * typed auth exception in spring-data-redis 4.0.5 / Lettuce 6.8.2, hence the text match.
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
        return startsWithToken(message, "WRONGPASS")
                || startsWithToken(message, "NOAUTH")
                || startsWithToken(message, "NOPERM");
    }

    private static boolean startsWithToken(String message, String token) {
        return message != null
                && message.toUpperCase(java.util.Locale.ROOT).stripLeading().startsWith(token);
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
