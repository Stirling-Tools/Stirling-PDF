package stirling.software.SPDF.config.security.database;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import lombok.Data;

@Data
@Configuration
@ConfigurationProperties(prefix = "spring.jpa")
public class JpaConfig {

    @Value("${environment.name}")
    private String environmentName;

    private String databasePlatform;
    private String openInView;
    private String generateDDL;
}
