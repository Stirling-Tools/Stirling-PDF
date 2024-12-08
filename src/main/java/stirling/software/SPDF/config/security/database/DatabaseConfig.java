package stirling.software.SPDF.config.security.database;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.Getter;

@Getter
@Configuration
public class DatabaseConfig {

    @Autowired private DataSourceConfig dataSourceConfig;

    @Autowired private JpaConfig jpaConfig;

    @Bean
    public DataSource dataSource() {
        return dataSourceConfig.dataSource();
    }

    @Bean
    public Connection connection() throws SQLException {
        return DriverManager.getConnection(
                dataSourceConfig.getUrl(),
                dataSourceConfig.getUsername(),
                dataSourceConfig.getPassword());
    }
}
