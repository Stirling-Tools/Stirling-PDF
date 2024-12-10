package stirling.software.SPDF.config.security.database;

import java.sql.Connection;
import java.sql.SQLException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.Getter;
import stirling.software.SPDF.model.ApplicationProperties;

@Getter
@Configuration
public class DatabaseConfig {

    private final ApplicationProperties applicationProperties;

    public DatabaseConfig(@Autowired ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    @Bean
    public Connection connection() throws SQLException {
        ApplicationProperties.Datasource datasource =
                applicationProperties.getSystem().getDatasource();

        DataSourceBuilder<?> dataSourceBuilder = DataSourceBuilder.create();
        dataSourceBuilder.driverClassName(getDriverClassName(datasource.getDriver()));
        dataSourceBuilder.url(datasource.getUrl());
        dataSourceBuilder.username(datasource.getUsername());
        dataSourceBuilder.password(datasource.getPassword());

        return dataSourceBuilder.build().getConnection();
    }

    private String getDriverClassName(ApplicationProperties.Driver driverName) {
        switch (driverName) {
            case ORACLE -> {
                return "oracle.jdbc.OracleDriver";
            }
            case MY_SQL -> {
                return "com.mysql.cj.jdbc.Driver";
            }
            default -> {
                return "org.postgresql.Driver";
            }
        }
    }
}
