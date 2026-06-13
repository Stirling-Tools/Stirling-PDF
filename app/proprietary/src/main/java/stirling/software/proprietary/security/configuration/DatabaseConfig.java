package stirling.software.proprietary.security.configuration;

import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.Locale;
import java.util.Properties;
import java.util.logging.Logger;

import javax.sql.DataSource;

import io.quarkus.arc.profile.UnlessBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.inject.Singleton;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;

/**
 * MIGRATION NOTES (Spring -> Quarkus CDI):
 *
 * <ul>
 *   <li>{@code @Configuration} -> {@code @ApplicationScoped}; {@code @Bean} -> {@code @Produces}.
 *   <li>{@code @Qualifier("runningProOrHigher")} ctor param -> {@code @Inject} ctor with
 *       {@code @Named(...)} on the parameter (the producer lives in common {@code AppConfig}).
 *   <li>{@code @Profile("!saas")} on the producer -> {@code @UnlessBuildProfile("saas")} so the
 *       SaaS Postgres datasource shadows this H2 default exactly as the old profile override did.
 *   <li>{@code @Primary} dropped - the SaaS producer is selected by build profile instead of by
 *       primary/override semantics.
 *   <li>{@code @EnableJpaRepositories}/{@code @EntityScan} removed - Quarkus auto-discovers JPA
 *       entities and Panache repositories across the Jandex index; no explicit base-package wiring
 *       is needed.
 *   <li>Spring Boot {@code DataSourceBuilder}/{@code DatabaseDriver} (no Quarkus equivalent) ->
 *       replaced with a minimal {@link DriverManager}-backed {@link DataSource}. This preserves the
 *       original lazy-connect semantics of {@code DataSourceBuilder.build()} (no connection is
 *       opened until {@link DataSource#getConnection()} is called); the driver class-name strings
 *       are the same literals {@code DatabaseDriver.H2/POSTGRESQL.getDriverClassName()} returned.
 * </ul>
 *
 * <p>TODO: Migration required - the idiomatic Quarkus approach is to drop this programmatic
 * producer entirely and configure the datasource via {@code quarkus.datasource.*} (jdbc-url /
 * username / password / db-kind), letting Agroal own the connection pool. This producer is retained
 * to preserve the runtime "custom database" toggle (premium + {@code
 * datasource.enableCustomDatabase}) that selects between the bundled H2 file DB and a user-supplied
 * URL at startup - static config cannot express that branch on its own. The {@code DriverManager}
 * datasource below is intentionally unpooled; if connection pooling is required it should be
 * obtained from the Agroal-managed default datasource instead.
 */
@Slf4j
@Getter
@ApplicationScoped
public class DatabaseConfig {

    /** {@code org.springframework.boot.jdbc.DatabaseDriver.H2.getDriverClassName()}. */
    private static final String H2_DRIVER_CLASS_NAME = "org.h2.Driver";

    /** {@code org.springframework.boot.jdbc.DatabaseDriver.POSTGRESQL.getDriverClassName()}. */
    private static final String POSTGRESQL_DRIVER_CLASS_NAME = "org.postgresql.Driver";

    public final String DATASOURCE_DEFAULT_URL;

    public static final String DATASOURCE_URL_TEMPLATE = "jdbc:%s://%s:%4d/%s";
    public static final String DEFAULT_USERNAME = "sa";

    private final ApplicationProperties.Datasource datasource;
    private final boolean runningProOrHigher;

    @Inject
    public DatabaseConfig(
            ApplicationProperties.Datasource datasource,
            @Named("runningProOrHigher") boolean runningProOrHigher) {
        DATASOURCE_DEFAULT_URL =
                "jdbc:h2:file:"
                        + InstallationPathConfig.getConfigPath()
                        + "stirling-pdf-DB-2.3.232;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;MODE=PostgreSQL";
        log.debug("Database URL: {}", DATASOURCE_DEFAULT_URL);
        this.datasource = datasource;
        this.runningProOrHigher = runningProOrHigher;
    }

    /**
     * Creates the <code>DataSource</code> for the connection to the DB. If <code>useDefault</code>
     * is set to <code>true</code>, it will use the default H2 DB. If it is set to <code>false
     * </code>, it will use the user's custom configuration set in the settings.yml.
     *
     * @return a <code>DataSource</code> using the configuration settings in the settings.yml
     * @throws UnsupportedProviderException if the type of database selected is not supported
     */
    @Produces
    // @Singleton (pseudo-scope), NOT @ApplicationScoped: a normal-scoped producer of
    // javax.sql.DataSource makes Arc generate a client proxy in the JDK-sealed javax.sql package,
    // which fails to load (NoClassDefFoundError) the moment the bean is actually instantiated.
    // @Singleton injects the real instance directly (no proxy) and is still a single shared bean.
    @Singleton
    @Named("dataSource")
    @UnlessBuildProfile("saas")
    public DataSource dataSource() throws UnsupportedProviderException {
        if (!runningProOrHigher || !datasource.isEnableCustomDatabase()) {
            return useDefaultDataSource();
        }

        return useCustomDataSource();
    }

    private DataSource useDefaultDataSource() {
        // Support AOT training: override URL via system property to avoid H2 file lock
        // conflicts when the AOT RECORD phase starts a second Spring context
        String overrideUrl = System.getProperty("stirling.datasource.url");
        String url =
                (overrideUrl != null && !overrideUrl.isBlank())
                        ? overrideUrl
                        : DATASOURCE_DEFAULT_URL;

        log.info("Using default H2 database");

        return new SimpleDriverDataSource(H2_DRIVER_CLASS_NAME, url, DEFAULT_USERNAME, null);
    }

    // TODO: Migration required - the Spring @ConditionalOnBooleanProperty(name = "premium.enabled")
    // gate is not expressible on a private helper under CDI. The custom-database path is already
    // guarded at runtime by the runningProOrHigher + datasource.enableCustomDatabase checks in
    // dataSource(); if a separate premium.enabled toggle is still required, read it via
    // org.eclipse.microprofile.config.Config (e.g. premium.enabled) inside dataSource() before
    // calling this method.
    private DataSource useCustomDataSource() throws UnsupportedProviderException {
        log.info("Using custom database configuration");

        String driverClassName;
        String url;

        if (!datasource.getCustomDatabaseUrl().isBlank()) {
            driverClassName =
                    datasource.getCustomDatabaseUrl().contains("postgresql")
                            ? POSTGRESQL_DRIVER_CLASS_NAME
                            : null;
            url = datasource.getCustomDatabaseUrl();
        } else {
            driverClassName = getDriverClassName(datasource.getType());
            url =
                    generateCustomDataSourceUrl(
                            datasource.getType(),
                            datasource.getHostName(),
                            datasource.getPort(),
                            datasource.getName());
        }

        return new SimpleDriverDataSource(
                driverClassName, url, datasource.getUsername(), datasource.getPassword());
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
                    yield H2_DRIVER_CLASS_NAME;
                }
                case POSTGRESQL -> {
                    log.debug("Postgres driver selected");
                    yield POSTGRESQL_DRIVER_CLASS_NAME;
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

    /**
     * Minimal unpooled {@link DataSource} backed by {@link DriverManager}, replacing Spring Boot's
     * {@code DataSourceBuilder}. Connections are opened lazily on {@link #getConnection()}
     * (matching {@code DataSourceBuilder.build()} semantics) and the optional driver class is
     * loaded eagerly so it self-registers with {@link DriverManager}.
     */
    private static final class SimpleDriverDataSource implements DataSource {

        private final String url;
        private final String username;
        private final String password;
        private PrintWriter logWriter;
        private int loginTimeout;

        SimpleDriverDataSource(
                String driverClassName, String url, String username, String password) {
            if (driverClassName != null && !driverClassName.isBlank()) {
                try {
                    Class.forName(driverClassName);
                } catch (ClassNotFoundException e) {
                    log.warn("JDBC driver {} not found on the classpath", driverClassName, e);
                }
            }
            this.url = url;
            this.username = username;
            this.password = password;
        }

        @Override
        public Connection getConnection() throws SQLException {
            return getConnection(username, password);
        }

        @Override
        public Connection getConnection(String user, String pass) throws SQLException {
            Properties props = new Properties();
            if (user != null) {
                props.setProperty("user", user);
            }
            if (pass != null) {
                props.setProperty("password", pass);
            }
            return DriverManager.getConnection(url, props);
        }

        @Override
        public PrintWriter getLogWriter() {
            return logWriter;
        }

        @Override
        public void setLogWriter(PrintWriter out) {
            this.logWriter = out;
        }

        @Override
        public void setLoginTimeout(int seconds) {
            this.loginTimeout = seconds;
        }

        @Override
        public int getLoginTimeout() {
            return loginTimeout;
        }

        @Override
        public Logger getParentLogger() throws SQLFeatureNotSupportedException {
            throw new SQLFeatureNotSupportedException();
        }

        @Override
        public <T> T unwrap(Class<T> iface) throws SQLException {
            if (iface.isInstance(this)) {
                return iface.cast(this);
            }
            throw new SQLException(
                    "DataSource of type ["
                            + getClass().getName()
                            + "] cannot be unwrapped as ["
                            + iface.getName()
                            + "]");
        }

        @Override
        public boolean isWrapperFor(Class<?> iface) {
            return iface.isInstance(this);
        }
    }
}
