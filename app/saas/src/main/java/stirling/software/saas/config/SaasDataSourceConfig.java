package stirling.software.saas.config;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.jdbc.DatabaseDriver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import lombok.extern.slf4j.Slf4j;

/** SaaS-profile Postgres Hikari DataSource. {@code @Primary} so it shadows the OSS H2 default. */
@Slf4j
@Configuration
@Profile("saas")
public class SaasDataSourceConfig {

    @Value("${spring.datasource.url:}")
    private String url;

    @Value("${spring.datasource.username:postgres}")
    private String username;

    @Value("${spring.datasource.password:}")
    private String password;

    @Value("${spring.datasource.hikari.maximum-pool-size:20}")
    private int maximumPoolSize;

    @Value("${spring.datasource.hikari.minimum-idle:5}")
    private int minimumIdle;

    @Value("${spring.datasource.hikari.idle-timeout:600000}")
    private long idleTimeout;

    @Value("${spring.datasource.hikari.max-lifetime:1800000}")
    private long maxLifetime;

    @Value("${spring.datasource.hikari.keepalive-time:300000}")
    private long keepaliveTime;

    @Value("${spring.datasource.hikari.data-source-properties.ApplicationName:StirlingPDF-SaaS}")
    private String applicationName;

    // search_path so native SQL hits stirling_pdf, not the postgres-default public.
    @Value(
            "${spring.datasource.hikari.connection-init-sql:SET search_path TO stirling_pdf, auth, public}")
    private String connectionInitSql;

    @Bean
    @Primary
    @Qualifier("dataSource")
    public DataSource saasDataSource() {
        if (url == null || url.isBlank()) {
            throw new IllegalStateException(
                    "spring.datasource.url is required when the saas profile is active. "
                            + "Set it via application-{profile}.properties (e.g. application-dev.properties) "
                            + "or via the SPRING_DATASOURCE_URL env var.");
        }

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(addApplicationName(url, applicationName));
        config.setUsername(username);
        config.setPassword(password);
        config.setDriverClassName(DatabaseDriver.POSTGRESQL.getDriverClassName());
        config.setMaximumPoolSize(maximumPoolSize);
        config.setMinimumIdle(minimumIdle);
        config.setIdleTimeout(idleTimeout);
        config.setMaxLifetime(maxLifetime);
        config.setKeepaliveTime(keepaliveTime);
        if (connectionInitSql != null && !connectionInitSql.isBlank()) {
            config.setConnectionInitSql(connectionInitSql);
        }

        log.info(
                "Saas DataSource configured (ApplicationName: '{}', max pool: {}, min idle: {}, search_path init: '{}')",
                applicationName,
                maximumPoolSize,
                minimumIdle,
                connectionInitSql);

        return new HikariDataSource(config);
    }

    private static String addApplicationName(String jdbcUrl, String appName) {
        if (jdbcUrl == null
                || appName == null
                || jdbcUrl.toLowerCase().contains("applicationname=")) {
            return jdbcUrl;
        }
        String separator = jdbcUrl.contains("?") ? "&" : "?";
        return jdbcUrl + separator + "ApplicationName=" + appName;
    }
}
