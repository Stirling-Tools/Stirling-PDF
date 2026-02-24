package stirling.software.proprietary.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** Configuration for audit system transaction management. */
@Configuration
@EnableTransactionManagement
public class AuditJpaConfig {
    // Scheduling is enabled on SPDFApplication — no duplicate @EnableScheduling needed.
    // JPA repositories are now managed by DatabaseConfig to avoid conflicts.
}
