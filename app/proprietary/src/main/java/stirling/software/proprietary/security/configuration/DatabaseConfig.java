package stirling.software.proprietary.security.configuration;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.boot.jdbc.DatabaseDriver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

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
            "stirling.software.proprietary.security.repository"
        })
@EntityScan({"stirling.software.proprietary.security.model", "stirling.software.proprietary.model"})
public class DatabaseConfig {

    public final String DATASOURCE_DEFAULT_URL;

    public static final String DATASOURCE_URL_TEMPLATE = "jdbc:%s://%s:%4d/%s";
    public static final String DEFAULT_USERNAME = "sa";

    private final ApplicationProperties.Datasource datasource;
    private final boolean runningProOrHigher;

    public DatabaseConfig(
            ApplicationProperties.Datasource datasource,
            @Qualifier("runningProOrHigher") boolean runningProOrHigher) {
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
    @Bean
    @Qualifier("dataSource")
    @Primary
    public DataSource dataSource() throws UnsupportedProviderException {
        DataSourceBuilder<?> dataSourceBuilder = DataSourceBuilder.create();

        if (!runningProOrHigher || !datasource.isEnableCustomDatabase()) {
            return useDefaultDataSource(dataSourceBuilder);
        }

        return useCustomDataSource(dataSourceBuilder);
    }

    private DataSource useDefaultDataSource(DataSourceBuilder<?> dataSourceBuilder) {
        log.info("Using default H2 database");

        dataSourceBuilder
                .url(DATASOURCE_DEFAULT_URL)
                .driverClassName(DatabaseDriver.H2.getDriverClassName())
                .username(DEFAULT_USERNAME);

        return dataSourceBuilder.build();
    }

    @ConditionalOnBooleanProperty(name = "premium.enabled")
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
                    ApplicationProperties.Driver.valueOf(driverName.toUpperCase());

            switch (driver) {
                case H2 -> {
                    log.debug("H2 driver selected");
                    return DatabaseDriver.H2.getDriverClassName();
                }
                case POSTGRESQL -> {
                    log.debug("Postgres driver selected");
                    return DatabaseDriver.POSTGRESQL.getDriverClassName();
                }
                default -> {
                    log.warn("{} driver selected", driverName);
                    throw new UnsupportedProviderException(
                            driverName + " is not currently supported");
                }
            }
        } catch (IllegalArgumentException e) {
            log.warn("Unknown driver: {}", driverName);
            throw new UnsupportedProviderException(driverName + " is not currently supported");
        }
    }
}
