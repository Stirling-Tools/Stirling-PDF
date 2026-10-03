package stirling.software.proprietary.security.configuration;

import java.util.Locale;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.boot.jdbc.DatabaseDriver;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import com.zaxxer.hikari.HikariDataSource;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;

@Slf4j
@Getter
@Configuration
@EnableJpaRepositories(
        basePackages = {
            "stirling.software.proprietary.security.database.repository",
            "stirling.software.proprietary.security.repository",
            "stirling.software.proprietary.repository",
            "stirling.software.proprietary.storage.repository",
            "stirling.software.proprietary.workflow.repository",
            "stirling.software.proprietary.policy.asset",
            "stirling.software.proprietary.policy.store",
            "stirling.software.proprietary.policy.source",
            "stirling.software.proprietary.policy.migration",
            "stirling.software.proprietary.policy.ledger",
            "stirling.software.proprietary.accountlink",
            "stirling.software.proprietary.access.repository",
            "stirling.software.proprietary.integration.repository",
            "stirling.software.proprietary.failure"
        })
@EntityScan({
    "stirling.software.proprietary.security.model",
    "stirling.software.proprietary.model",
    "stirling.software.proprietary.storage.model",
    "stirling.software.proprietary.workflow.model",
    "stirling.software.proprietary.policy.asset",
    "stirling.software.proprietary.policy.store",
    "stirling.software.proprietary.policy.source",
    "stirling.software.proprietary.policy.migration",
    "stirling.software.proprietary.policy.ledger",
    "stirling.software.proprietary.accountlink",
    "stirling.software.proprietary.access.model",
    "stirling.software.proprietary.integration.model",
    "stirling.software.proprietary.failure"
})
public class DatabaseConfig {

    public final String DATASOURCE_DEFAULT_URL;

    public static final String DATASOURCE_URL_TEMPLATE = "jdbc:%s://%s:%4d/%s";
    public static final String DEFAULT_USERNAME = "sa";

    private final ApplicationProperties.Datasource datasource;

    // Declaring the DataSource bean makes Boot's Hikari auto-config back off, so these have to be
    // bound by hand or spring.datasource.hikari.* is silently inert. Defaults match Hikari's own.
    @Value("${spring.datasource.hikari.maximum-pool-size:10}")
    private int maximumPoolSize;

    // -1 leaves Hikari's default, where minimumIdle tracks maximumPoolSize.
    @Value("${spring.datasource.hikari.minimum-idle:-1}")
    private int minimumIdle;

    @Value("${spring.datasource.hikari.idle-timeout:600000}")
    private long idleTimeout;

    @Value("${spring.datasource.hikari.max-lifetime:1800000}")
    private long maxLifetime;

    // 0 disables keepalive, as Hikari does out of the box.
    @Value("${spring.datasource.hikari.keepalive-time:0}")
    private long keepaliveTime;

    @Value("${spring.datasource.hikari.connection-timeout:30000}")
    private long connectionTimeout;

    /** Opens the configured database; entitlement checks must read this same database. */
    public DatabaseConfig(ApplicationProperties.Datasource datasource) {
        DATASOURCE_DEFAULT_URL =
                "jdbc:h2:file:"
                        + InstallationPathConfig.getConfigPath()
                        + "stirling-pdf-DB-2.3.232;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;MODE=PostgreSQL";
        log.debug("Database URL: {}", DATASOURCE_DEFAULT_URL);
        this.datasource = datasource;
    }

    /** Uses the configured database without falling back on an entitlement failure. */
    @Bean
    @Qualifier("dataSource")
    @Primary
    @Profile("!saas")
    public DataSource dataSource() throws UnsupportedProviderException {
        DataSourceBuilder<?> dataSourceBuilder = DataSourceBuilder.create();

        if (!datasource.isEnableCustomDatabase()) {
            return applyPoolSettings(useDefaultDataSource(dataSourceBuilder));
        }

        return applyPoolSettings(useCustomDataSource(dataSourceBuilder));
    }

    /**
     * Binds {@code spring.datasource.hikari.*} onto the pool. A remote database makes the defaults
     * of 10 connections and no keepalive a real constraint, and today there is no way to change
     * them. No-ops when the properties were never injected, e.g. under direct construction.
     */
    private DataSource applyPoolSettings(DataSource dataSource) {
        if (!(dataSource instanceof HikariDataSource hikari) || maximumPoolSize <= 0) {
            return dataSource;
        }
        hikari.setMaximumPoolSize(maximumPoolSize);
        if (minimumIdle >= 0) {
            hikari.setMinimumIdle(minimumIdle);
        }
        hikari.setIdleTimeout(idleTimeout);
        hikari.setMaxLifetime(maxLifetime);
        hikari.setKeepaliveTime(keepaliveTime);
        hikari.setConnectionTimeout(connectionTimeout);
        log.info(
                "Connection pool: max {}, min idle {}, keepalive {}ms, max lifetime {}ms",
                hikari.getMaximumPoolSize(),
                hikari.getMinimumIdle(),
                keepaliveTime,
                maxLifetime);
        return dataSource;
    }

    private DataSource useDefaultDataSource(DataSourceBuilder<?> dataSourceBuilder) {
        // Support AOT training: override URL via system property to avoid H2 file lock
        // conflicts when the AOT RECORD phase starts a second Spring context
        String overrideUrl = System.getProperty("stirling.datasource.url");
        String url =
                (overrideUrl != null && !overrideUrl.isBlank())
                        ? overrideUrl
                        : DATASOURCE_DEFAULT_URL;

        log.info("Using default H2 database");

        dataSourceBuilder
                .url(url)
                .driverClassName(DatabaseDriver.H2.getDriverClassName())
                .username(DEFAULT_USERNAME);

        return dataSourceBuilder.build();
    }

    private DataSource useCustomDataSource(DataSourceBuilder<?> dataSourceBuilder)
            throws UnsupportedProviderException {
        log.info("Using custom database configuration");

        if (!datasource.getCustomDatabaseUrl().isBlank()) {
            if (datasource.getCustomDatabaseUrl().contains("postgresql")) {
                dataSourceBuilder.driverClassName(DatabaseDriver.POSTGRESQL.getDriverClassName());
            }

            dataSourceBuilder.url(datasource.getCustomDatabaseUrl());
        } else {
            dataSourceBuilder.driverClassName(getDriverClassName(datasource.getType()));
            dataSourceBuilder.url(
                    generateCustomDataSourceUrl(
                            datasource.getType(),
                            datasource.getHostName(),
                            datasource.getPort(),
                            datasource.getName()));
        }
        dataSourceBuilder.username(datasource.getUsername());
        dataSourceBuilder.password(datasource.getPassword());

        return dataSourceBuilder.build();
    }

    /**
     * Generate the URL the <code>DataSource</code> will use to connect to the database
     *
     * @param dataSourceType the type of the database
     * @param hostname the host name
     * @param port the port number to use for the database
     * @param dataSourceName the name the database to connect to
     * @return the <code>DataSource</code> URL
     */
    private String generateCustomDataSourceUrl(
            String dataSourceType, String hostname, Integer port, String dataSourceName) {
        return DATASOURCE_URL_TEMPLATE.formatted(dataSourceType, hostname, port, dataSourceName);
    }

    /**
     * Selects the database driver based on the type of database chosen.
     *
     * @param driverName the type of the driver (e.g. 'h2', 'postgresql')
     * @return the fully qualified driver for the database chosen
     * @throws UnsupportedProviderException when an unsupported database is selected
     */
    private String getDriverClassName(String driverName) throws UnsupportedProviderException {
        try {
            ApplicationProperties.Driver driver =
                    ApplicationProperties.Driver.valueOf(driverName.toUpperCase(Locale.ROOT));

            return switch (driver) {
                case H2 -> {
                    log.debug("H2 driver selected");
                    yield DatabaseDriver.H2.getDriverClassName();
                }
                case POSTGRESQL -> {
                    log.debug("Postgres driver selected");
                    yield DatabaseDriver.POSTGRESQL.getDriverClassName();
                }
                default -> {
                    log.warn("{} driver selected", driverName);
                    throw new UnsupportedProviderException(
                            driverName + " is not currently supported");
                }
            };
        } catch (IllegalArgumentException e) {
            log.warn("Unknown driver: {}", driverName);
            throw new UnsupportedProviderException(driverName + " is not currently supported");
        }
    }
}
