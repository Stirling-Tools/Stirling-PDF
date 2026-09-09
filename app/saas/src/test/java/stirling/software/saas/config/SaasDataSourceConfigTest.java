package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import javax.sql.DataSource;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;
import org.mockito.Mockito;
import org.springframework.boot.jdbc.DatabaseDriver;
import org.springframework.test.util.ReflectionTestUtils;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

/**
 * Unit tests for {@link SaasDataSourceConfig}.
 *
 * <p>The config's {@code @Value} fields are populated via {@link ReflectionTestUtils} so the {@code
 * saasDataSource()} bean method can be exercised without a Spring context. The returned {@link
 * HikariDataSource} is created lazily (no real connection until first use), so we can assert its
 * wiring and then close it in {@code @AfterEach}.
 */
class SaasDataSourceConfigTest {

    private final SaasDataSourceConfig config = new SaasDataSourceConfig();
    private DataSource created;

    @AfterEach
    void closePool() {
        if (created instanceof HikariDataSource hikari) {
            hikari.close();
        }
    }

    private void wireDefaults() {
        ReflectionTestUtils.setField(config, "username", "postgres");
        ReflectionTestUtils.setField(config, "password", "secret");
        ReflectionTestUtils.setField(config, "maximumPoolSize", 20);
        ReflectionTestUtils.setField(config, "minimumIdle", 5);
        ReflectionTestUtils.setField(config, "idleTimeout", 600000L);
        ReflectionTestUtils.setField(config, "maxLifetime", 1800000L);
        ReflectionTestUtils.setField(config, "keepaliveTime", 300000L);
        ReflectionTestUtils.setField(config, "applicationName", "StirlingPDF-SaaS");
        ReflectionTestUtils.setField(
                config, "connectionInitSql", "SET search_path TO stirling_pdf, auth, public");
    }

    @Nested
    @DisplayName("saasDataSource - missing url guard")
    class MissingUrl {

        @Test
        @DisplayName("throws IllegalStateException when url is null")
        void nullUrl_throws() {
            wireDefaults();
            ReflectionTestUtils.setField(config, "url", null);

            assertThatThrownBy(config::saasDataSource)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("spring.datasource.url is required");
        }

        @Test
        @DisplayName("throws IllegalStateException when url is blank")
        void blankUrl_throws() {
            wireDefaults();
            ReflectionTestUtils.setField(config, "url", "   ");

            assertThatThrownBy(config::saasDataSource)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("saas profile");
        }
    }

    @Nested
    @DisplayName("saasDataSource - successful wiring")
    class SuccessfulWiring {

        // new HikariDataSource(config) eagerly opens the pool, so intercept construction and assert
        // on the HikariConfig the bean built instead of connecting to a real Postgres.
        private HikariConfig capture(Runnable build) {
            HikariConfig[] holder = new HikariConfig[1];
            try (MockedConstruction<HikariDataSource> mocked =
                    Mockito.mockConstruction(
                            HikariDataSource.class,
                            (mock, ctx) -> holder[0] = (HikariConfig) ctx.arguments().get(0))) {
                build.run();
            }
            return holder[0];
        }

        @Test
        @DisplayName("builds a Hikari pool with the configured properties")
        void buildsPool() {
            wireDefaults();
            ReflectionTestUtils.setField(
                    config, "url", "jdbc:postgresql://localhost:5432/stirling");

            HikariConfig hikari = capture(config::saasDataSource);

            assertThat(hikari.getUsername()).isEqualTo("postgres");
            assertThat(hikari.getPassword()).isEqualTo("secret");
            assertThat(hikari.getMaximumPoolSize()).isEqualTo(20);
            assertThat(hikari.getMinimumIdle()).isEqualTo(5);
            assertThat(hikari.getIdleTimeout()).isEqualTo(600000L);
            assertThat(hikari.getMaxLifetime()).isEqualTo(1800000L);
            assertThat(hikari.getKeepaliveTime()).isEqualTo(300000L);
            assertThat(hikari.getDriverClassName())
                    .isEqualTo(DatabaseDriver.POSTGRESQL.getDriverClassName());
            assertThat(hikari.getConnectionInitSql())
                    .isEqualTo("SET search_path TO stirling_pdf, auth, public");
        }

        @Test
        @DisplayName("appends ApplicationName to a url that has no query string")
        void appendsApplicationName_noQuery() {
            wireDefaults();
            ReflectionTestUtils.setField(
                    config, "url", "jdbc:postgresql://localhost:5432/stirling");

            HikariConfig hikari = capture(config::saasDataSource);

            assertThat(hikari.getJdbcUrl()).contains("?ApplicationName=StirlingPDF-SaaS");
        }

        @Test
        @DisplayName("appends ApplicationName with '&' when url already has a query string")
        void appendsApplicationName_existingQuery() {
            wireDefaults();
            ReflectionTestUtils.setField(
                    config, "url", "jdbc:postgresql://localhost:5432/stirling?sslmode=require");

            HikariConfig hikari = capture(config::saasDataSource);

            assertThat(hikari.getJdbcUrl()).contains("&ApplicationName=StirlingPDF-SaaS");
        }

        @Test
        @DisplayName("does not duplicate ApplicationName when already present (case-insensitive)")
        void doesNotDuplicateApplicationName() {
            wireDefaults();
            ReflectionTestUtils.setField(
                    config,
                    "url",
                    "jdbc:postgresql://localhost:5432/stirling?applicationname=Existing");

            HikariConfig hikari = capture(config::saasDataSource);

            assertThat(hikari.getJdbcUrl())
                    .isEqualTo(
                            "jdbc:postgresql://localhost:5432/stirling?applicationname=Existing");
        }

        @Test
        @DisplayName("skips connection-init-sql when blank")
        void blankConnectionInitSql_notSet() {
            wireDefaults();
            ReflectionTestUtils.setField(
                    config, "url", "jdbc:postgresql://localhost:5432/stirling");
            ReflectionTestUtils.setField(config, "connectionInitSql", "   ");

            HikariConfig hikari = capture(config::saasDataSource);

            assertThat(hikari.getConnectionInitSql()).isNull();
        }

        @Test
        @DisplayName("skips connection-init-sql when null")
        void nullConnectionInitSql_notSet() {
            wireDefaults();
            ReflectionTestUtils.setField(
                    config, "url", "jdbc:postgresql://localhost:5432/stirling");
            ReflectionTestUtils.setField(config, "connectionInitSql", null);

            HikariConfig hikari = capture(config::saasDataSource);

            assertThat(hikari.getConnectionInitSql()).isNull();
        }
    }
}
