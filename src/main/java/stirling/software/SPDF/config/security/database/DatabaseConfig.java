package stirling.software.SPDF.config.security.database;

import java.sql.Connection;
import java.sql.SQLException;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;

@Getter
@Slf4j
@Configuration
public class DatabaseConfig {

    public static final String DOCKER_HOST = "://db:";
    public static final String LOCALHOST = "://localhost:";
    public static final String POSTGRES = "postgres";

    private final ApplicationProperties applicationProperties;

    public DatabaseConfig(@Autowired ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    @Bean
    public DataSource dataSource() {
        ApplicationProperties.System system = applicationProperties.getSystem();
        ApplicationProperties.Datasource datasource = system.getDatasource();
        String driverClassName = getDriverClassName(datasource.getDriver());
        String url = datasource.getUrl();
        String username = datasource.getUsername();
        String password = datasource.getPassword();
        DataSourceBuilder<?> dataSourceBuilder = DataSourceBuilder.create();

        if (system.getProfilesActive().equals("default")) {
            url = getDefaultProfileUrl(datasource);
            username = POSTGRES;
            password = POSTGRES;
        }

        dataSourceBuilder.driverClassName(driverClassName);
        dataSourceBuilder.url(url);
        dataSourceBuilder.username(username);
        dataSourceBuilder.password(password);

        return dataSourceBuilder.build();
    }

    public Connection connection() throws SQLException {
        return dataSource().getConnection();
    }

    private String getDefaultProfileUrl(ApplicationProperties.Datasource datasource) {
        String localUrl =
                datasource
                        .getUrl()
                        .replace(DOCKER_HOST, LOCALHOST)
                        .replace("stirling_pdf", POSTGRES);

        log.debug("The DB URL is now: {}", localUrl);

        return localUrl;
    }

    private String getDriverClassName(ApplicationProperties.Driver driverName) {
        switch (driverName) {
            case ORACLE -> {
                log.debug("Oracle driver selected");
                return "oracle.jdbc.OracleDriver";
            }
            case MY_SQL -> {
                log.debug("MySQL driver selected");
                return "com.mysql.cj.jdbc.Driver";
            }
            default -> {
                log.debug("Postgres driver selected");
                return "org.postgresql.Driver";
            }
        }
    }
}
