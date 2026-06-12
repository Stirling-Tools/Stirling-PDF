package stirling.software.proprietary.config;

import jakarta.enterprise.context.ApplicationScoped;

/** Configuration for audit system transaction management. */
// TODO: Migration required - Quarkus enables transaction management automatically
// (Narayana/JTA via quarkus-narayana-jta); the Spring @EnableTransactionManagement is
// not needed. Use jakarta.transaction.@Transactional on methods/beans as required.
// Scheduling is enabled on the application — no duplicate @EnableScheduling needed.
// JPA repositories are auto-discovered by Quarkus (no @EnableJpaRepositories needed).
@ApplicationScoped
public class AuditJpaConfig {}
