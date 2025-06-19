package stirling.software.proprietary.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** Configuration to explicitly enable JPA repositories and scheduling for the audit system. */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(basePackages = "stirling.software.proprietary.repository")
@EnableScheduling
public class AuditJpaConfig {
    // This configuration enables JPA repositories in the specified package
    // and enables scheduling for audit cleanup tasks
    // No additional beans or methods needed
}
