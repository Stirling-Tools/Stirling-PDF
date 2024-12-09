package stirling.software.SPDF.config.security.database;

import java.sql.Connection;
import java.sql.SQLException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.Getter;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.exception.UnsupportedDriverException;

@Getter
@Configuration
public class DatabaseConfig {

    @Autowired private ApplicationProperties applicationProperties;

    @Bean
    public Connection connection() throws SQLException {
        ApplicationProperties.Datasource datasource =
                applicationProperties.getSystem().getDatasource();

        DataSourceBuilder<?> dataSourceBuilder = DataSourceBuilder.create();
        dataSourceBuilder.driverClassName(getDriverClassName(datasource.getDriverClassName()));
        dataSourceBuilder.url(datasource.getUrl());
        dataSourceBuilder.username(datasource.getUsername());
        dataSourceBuilder.password(datasource.getPassword());

        return dataSourceBuilder.build().getConnection();
    }

    private String getDriverClassName(ApplicationProperties.Driver driverName) {
        switch (driverName) {
            case POSTGRESQL -> {
                return "org.postgresql.Driver";
            }
            case ORACLE -> {
                return "oracle.jdbc.OracleDriver";
            }
            case MY_SQL -> {
                return "com.mysql.cj.jdbc.Driver";
            }
            default ->
                    throw new UnsupportedDriverException(
                            "The database driver " + driverName + " is not supported.");
        }
    }
}
