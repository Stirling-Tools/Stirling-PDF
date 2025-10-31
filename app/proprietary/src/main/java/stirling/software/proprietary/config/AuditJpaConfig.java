package stirling.software.proprietary.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** Configuration to enable scheduling for the audit system. */
@Configuration
@EnableTransactionManagement
@EnableScheduling
public class AuditJpaConfig {
    // This configuration enables scheduling for audit cleanup tasks
    // JPA repositories are now managed by DatabaseConfig to avoid conflicts
    // No additional beans or methods needed
}
