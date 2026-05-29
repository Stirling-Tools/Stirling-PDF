package stirling.software.saas.payg.policy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

/**
 * Listens on the Postgres {@code policy_changed} channel and publishes a {@link PolicyChangedEvent}
 * when a {@code pricing_policy*} row or a {@code payg_team_extensions} override changes. Triggers
 * on the database side call {@code pg_notify('policy_changed', ...)}; this runner translates them
 * into Spring events that {@link PricingPolicyService} (and any other cache holder) listens for.
 *
 * <h2>Why a dedicated raw JDBC connection</h2>
 *
 * <p>PgJDBC's {@code LISTEN} binds notifications to a specific {@link Connection} for that
 * connection's lifetime. HikariCP would eventually evict an idle connection (Hikari's {@code
 * idleTimeout} / {@code maxLifetime}), losing notifications without us noticing — so we open our
 * own raw connection via {@link DriverManager} and hold it. Loss of one DB connection is an
 * acceptable cost; if it ever becomes contentious we can carve out a tiny separate {@code
 * DataSource}.
 *
 * <h2>Failure mode</h2>
 *
 * <p>If the connection drops (network blip, Postgres restart), the polling loop catches the {@link
 * SQLException}, logs, sleeps {@value #RECONNECT_BACKOFF_MS} ms, and retries. The 30s {@link
 * PricingPolicyService} cache TTL acts as a correctness floor during outages — admin mutations
 * still propagate within at most 30 seconds even if LISTEN is wholly broken.
 *
 * <h2>Disabling</h2>
 *
 * <p>Set {@code payg.policy.listen.enabled=false} to skip the runner entirely (useful in tests and
 * single-instance dev where the 30s TTL is more than enough).
 */
@Component
@Profile("saas")
@ConditionalOnProperty(
        prefix = "payg.policy.listen",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
@Slf4j
public class PolicyChangeListener {

    static final String CHANNEL = "policy_changed";
    private static final long POLL_TIMEOUT_MS = 5_000L;
    private static final long RECONNECT_BACKOFF_MS = 5_000L;

    private final String jdbcUrl;
    private final String username;
    private final String password;
    private final ApplicationEventPublisher eventPublisher;

    private final AtomicBoolean running = new AtomicBoolean(false);
    private ExecutorService executor;
    // Connection lifecycle (open / close / null-out) is mutated by both the poll thread and
    // stop() on the container shutdown thread. All read/write of the field happens inside
    // synchronized(connectionLock); the actual blocking I/O on the returned reference runs
    // outside the lock so stop() can close the connection while the poll thread is mid-read.
    private final Object connectionLock = new Object();
    private Connection listenConnection;

    public PolicyChangeListener(
            @Value("${spring.datasource.url}") String jdbcUrl,
            @Value("${spring.datasource.username}") String username,
            @Value("${spring.datasource.password:}") String password,
            ApplicationEventPublisher eventPublisher) {
        this.jdbcUrl = jdbcUrl;
        this.username = username;
        this.password = password;
        this.eventPublisher = eventPublisher;
    }

    @PostConstruct
    void start() {
        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            log.warn(
                    "spring.datasource.url is empty; PolicyChangeListener will not start."
                            + " PricingPolicyService falls back to its 30s TTL.");
            return;
        }
        running.set(true);
        executor =
                Executors.newSingleThreadExecutor(
                        r -> {
                            Thread t = new Thread(r, "payg-policy-listen");
                            t.setDaemon(true);
                            return t;
                        });
        executor.submit(this::pollLoop);
        log.info("PolicyChangeListener started on channel '{}'.", CHANNEL);
    }

    @PreDestroy
    void stop() {
        // Order matters: signal the poll loop to exit, interrupt + wait for it, THEN close the
        // connection. Closing first would race the polling thread's getNotifications() call.
        running.set(false);
        if (executor != null) {
            executor.shutdownNow();
            try {
                if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                    log.warn("PolicyChangeListener executor did not terminate within 5s.");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        closeConnectionQuietly();
        log.info("PolicyChangeListener stopped.");
    }

    private void pollLoop() {
        while (running.get()) {
            try {
                Connection conn = acquireConnection();
                drainNotifications(conn);
            } catch (SQLException e) {
                log.warn(
                        "PolicyChangeListener IO error ({}). Reconnecting in {}ms.",
                        e.getMessage(),
                        RECONNECT_BACKOFF_MS);
                closeConnectionQuietly();
                sleepQuietly(RECONNECT_BACKOFF_MS);
            } catch (RuntimeException e) {
                // Don't let a bug in the polling loop kill the thread silently.
                log.error("PolicyChangeListener unexpected error; restarting after backoff.", e);
                closeConnectionQuietly();
                sleepQuietly(RECONNECT_BACKOFF_MS);
            }
        }
    }

    /**
     * Returns the current LISTEN connection, opening one if absent or closed. The check + open +
     * assign run inside the lock so {@link #closeConnectionQuietly()} can't slip between them.
     */
    private Connection acquireConnection() throws SQLException {
        synchronized (connectionLock) {
            if (listenConnection == null || listenConnection.isClosed()) {
                listenConnection = openListenConnection();
            }
            return listenConnection;
        }
    }

    private Connection openListenConnection() throws SQLException {
        Connection conn = DriverManager.getConnection(jdbcUrl, username, password);
        try (Statement st = conn.createStatement()) {
            st.execute("LISTEN " + CHANNEL);
        }
        return conn;
    }

    private void drainNotifications(Connection conn) throws SQLException {
        PGConnection pg = conn.unwrap(PGConnection.class);
        PGNotification[] notifications = pg.getNotifications((int) POLL_TIMEOUT_MS);
        if (notifications == null) {
            return;
        }
        for (PGNotification n : notifications) {
            String payload = n.getParameter();
            log.debug("PolicyChangeListener received notification: '{}'.", payload);
            try {
                eventPublisher.publishEvent(new PolicyChangedEvent(this, payload));
            } catch (RuntimeException publishError) {
                // A bad listener mustn't break this loop or stop future notifications.
                log.warn(
                        "PolicyChangedEvent listener threw ({}); continuing.",
                        publishError.getMessage());
            }
        }
    }

    private void closeConnectionQuietly() {
        synchronized (connectionLock) {
            if (listenConnection != null) {
                try {
                    listenConnection.close();
                } catch (SQLException e) {
                    log.debug("Ignoring close error on listen connection: {}", e.getMessage());
                }
                listenConnection = null;
            }
        }
    }

    private static void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
