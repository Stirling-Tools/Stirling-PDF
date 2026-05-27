package stirling.software.saas.config;

import javax.sql.DataSource;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;

/**
 * Cluster-aware scheduler dedup via ShedLock.
 *
 * <p>Without this, {@code CreditResetScheduler} fires on every Spring Boot instance — a 2-pod
 * deploy on the 1st of the month would query and write the reset twice. The row-level idempotency
 * guard inside the SQL (the {@code WHERE last_cycle_reset_at &lt; :resetTime} filter) prevents
 * double-granting at the row level, but two pods racing still means duplicate scans, duplicate
 * metric increments, and (once the PAYG ledger lands) duplicate {@code CYCLE_GRANT} ledger entries
 * that would diverge the cache-vs-ledger reconciliation.
 *
 * <p>{@code defaultLockAtMostFor = PT15M}: the upper bound on how long a lock is held if the holder
 * crashes mid-job without releasing. The monthly reset is normally seconds; 15 min is paranoid
 * headroom for "Postgres just spun up and is slow." Individual {@code @SchedulerLock} uses can
 * override.
 *
 * <p>Lock storage lives in {@code stirling_pdf.shedlock} (see V10 migration). The JDBC provider
 * works fine with our existing Hikari pool — no separate connection or scheduler needed.
 */
@Configuration
@Profile("saas")
@EnableSchedulerLock(defaultLockAtMostFor = "PT15M")
public class ShedLockConfig {

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        // useDbTime() asks Postgres for `now()` instead of the JVM clock so clock skew between
        // application instances doesn't cause a pod to think a lock has expired when it hasn't.
        return new JdbcTemplateLockProvider(
                JdbcTemplateLockProvider.Configuration.builder()
                        .withJdbcTemplate(
                                new org.springframework.jdbc.core.JdbcTemplate(dataSource))
                        .usingDbTime()
                        .build());
    }
}
