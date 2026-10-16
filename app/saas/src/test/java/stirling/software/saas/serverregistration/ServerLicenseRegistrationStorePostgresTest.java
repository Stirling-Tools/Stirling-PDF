package stirling.software.saas.serverregistration;

import static org.assertj.core.api.Assertions.*;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.*;

@Testcontainers(disabledWithoutDocker = true)
class ServerLicenseRegistrationStorePostgresTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final String SECRET = "a".repeat(43);
    private JdbcTemplate jdbc;
    private TransactionTemplate transactions;
    private ServerLicenseRegistrationStore store;
    private final UUID installation = UUID.randomUUID();
    private final KeygenServerLicenseVerifier.VerifiedLicense license =
            new KeygenServerLicenseVerifier.VerifiedLicense(UUID.randomUUID(), "test-license", 0);

    @BeforeEach
    void setup() {
        var dataSource =
                new DriverManagerDataSource(
                        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        jdbc = new JdbcTemplate(dataSource);
        transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        store = new ServerLicenseRegistrationStore(jdbc);
        // Constraint and RLS coverage uses the real migration in the SaaS repository's PGlite test.
        jdbc.execute(
                "DROP TABLE IF EXISTS public.server_license_registrations, public.license_keys");
        jdbc.execute(
                """
                CREATE TABLE public.license_keys(id UUID PRIMARY KEY, license_key TEXT, plan TEXT,
                    server_subscription_id TEXT, enterprise_seat_subscription_id TEXT);
                CREATE TABLE public.server_license_registrations(
                    registration_id UUID PRIMARY KEY, installation_id UUID, keygen_license_id UUID,
                    credential_hash TEXT, license_record_id UUID, server_subscription_id TEXT, license_user_limit INTEGER,
                    report_sequence BIGINT DEFAULT 0, reported_user_count BIGINT, application_version TEXT,
                    capability_version INTEGER, reported_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ,
                    revoked_at TIMESTAMPTZ, UNIQUE(keygen_license_id,installation_id))
                """);
        jdbc.update(
                "INSERT INTO public.license_keys VALUES (?, ?, 'server', 'sub_test', NULL)",
                UUID.randomUUID(),
                license.key());
    }

    @Test
    void bootstrapRetriesPinOneCredentialAndSeparateUnlimitedFromObservedCount() {
        Receipt first = register(1, 147, SECRET);
        assertThat(register(1, 147, SECRET)).isEqualTo(first);
        assertThat(first.purchaseMapping()).isEqualTo(PurchaseMapping.RESOLVED);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM public.server_license_registrations",
                                Long.class))
                .isEqualTo(1);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT license_user_limit FROM public.server_license_registrations",
                                Integer.class))
                .isZero();
        assertThat(
                        jdbc.queryForObject(
                                "SELECT reported_user_count FROM public.server_license_registrations",
                                Long.class))
                .isEqualTo(147);
        assertStatus(HttpStatus.UNAUTHORIZED, () -> register(2, 200, "b".repeat(43)));
        assertThat(
                        jdbc.queryForObject(
                                "SELECT reported_user_count FROM public.server_license_registrations",
                                Long.class))
                .isEqualTo(147);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT server_subscription_id FROM public.license_keys",
                                String.class))
                .isEqualTo("sub_test");
        assertThat(
                        jdbc.queryForObject(
                                "SELECT credential_hash FROM public.server_license_registrations",
                                String.class))
                .doesNotContain(SECRET);
    }

    @Test
    void staleAndChangedReportsCannotOverwriteCountsOrRefreshFreshness() {
        Receipt first = register(3, 147, SECRET);
        jdbc.update(
                "UPDATE public.server_license_registrations SET last_seen_at='2020-01-01T00:00:00Z', reported_at='2020-01-01T00:00:00Z'");
        sync(first, 3, 147, SECRET);
        assertThat(
                        jdbc.queryForObject(
                                        "SELECT last_seen_at FROM public.server_license_registrations",
                                        java.sql.Timestamp.class)
                                .toInstant())
                .isEqualTo(Instant.parse("2020-01-01T00:00:00Z"));
        assertStatus(HttpStatus.CONFLICT, () -> sync(first, 2, 200, SECRET));
        assertStatus(HttpStatus.CONFLICT, () -> sync(first, 3, 200, SECRET));
        sync(first, 4, 200, SECRET);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT reported_user_count FROM public.server_license_registrations",
                                Long.class))
                .isEqualTo(200);
        assertThat(
                        jdbc.queryForObject(
                                        "SELECT last_seen_at FROM public.server_license_registrations",
                                        java.sql.Timestamp.class)
                                .toInstant())
                .isAfter(Instant.parse("2020-01-01T00:00:00Z"));
    }

    @Test
    void revokedAndUnknownCredentialsCannotReportOrReregister() {
        Receipt first = register(1, 147, SECRET);
        assertStatus(HttpStatus.UNAUTHORIZED, () -> sync(first, 2, 0, "b".repeat(43)));
        assertStatus(
                HttpStatus.UNAUTHORIZED,
                () ->
                        sync(
                                new Receipt(UUID.randomUUID(), 1, PurchaseMapping.UNRESOLVED),
                                2,
                                0,
                                SECRET));
        jdbc.update("UPDATE public.server_license_registrations SET revoked_at=now()");
        assertStatus(HttpStatus.UNAUTHORIZED, () -> sync(first, 2, 0, SECRET));
        assertStatus(HttpStatus.UNAUTHORIZED, () -> register(2, 0, SECRET));
    }

    @Test
    void ambiguousOrBlankPurchasesStayUnresolvedAndCanBeReconciledOnBootstrap() {
        jdbc.update("UPDATE public.license_keys SET server_subscription_id=' '");
        Receipt first = register(1, 147, SECRET);
        assertThat(first.purchaseMapping()).isEqualTo(PurchaseMapping.UNRESOLVED);
        jdbc.update("UPDATE public.license_keys SET server_subscription_id='sub_fixed'");
        Receipt resolved = register(2, 147, SECRET);
        assertThat(resolved.registrationId()).isEqualTo(first.registrationId());
        assertThat(resolved.purchaseMapping()).isEqualTo(PurchaseMapping.RESOLVED);
        jdbc.update(
                "INSERT INTO public.license_keys VALUES (?, ?, 'server', 'sub_duplicate', NULL)",
                UUID.randomUUID(),
                license.key());
        assertThat(register(3, 147, SECRET).purchaseMapping())
                .isEqualTo(PurchaseMapping.UNRESOLVED);
    }

    @Test
    void concurrentLostReplyRetriesReturnTheSameRegistration() throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var task =
                    (java.util.concurrent.Callable<Receipt>)
                            () -> {
                                ready.countDown();
                                assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                                return register(1, 147, SECRET);
                            };
            var one = executor.submit(task);
            var two = executor.submit(task);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(one.get(20, TimeUnit.SECONDS)).isEqualTo(two.get(20, TimeUnit.SECONDS));
        }
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM public.server_license_registrations",
                                Long.class))
                .isEqualTo(1);
    }

    private Receipt register(long sequence, long count, String secret) {
        return transactions.execute(
                status ->
                        store.register(
                                new RegistrationRequest(
                                        installation,
                                        "proof",
                                        "machine",
                                        secret,
                                        new Report(sequence, count, "test", 1)),
                                license));
    }

    private Receipt sync(Receipt registration, long sequence, long count, String secret) {
        return transactions.execute(
                status ->
                        store.sync(
                                new SyncRequest(
                                        registration.registrationId(),
                                        secret,
                                        new Report(sequence, count, "test", 1))));
    }

    private void assertStatus(HttpStatus expected, Supplier<?> action) {
        assertThatThrownBy(action::get)
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(expected));
    }
}
