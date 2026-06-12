package stirling.software.saas.service;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.saas.repository.SupabaseUserRepository;

/**
 * Service to periodically clean up anonymous users older than 30 days. Based on Supabase's
 * recommendation for anonymous user management.
 */
@Slf4j
@ApplicationScoped
public class AnonymousUserCleanupService {

    @ConfigProperty(name = "app.auth.anonymous.enabled", defaultValue = "true")
    boolean anonEnabled;

    @ConfigProperty(name = "app.auth.anonymous.retention-days", defaultValue = "30")
    int retentionDays;

    @ConfigProperty(name = "app.auth.anonymous.cleanup-batch-size", defaultValue = "100")
    int batchSize;

    @Inject UserRepository userRepository;

    @Inject SupabaseUserRepository supabaseUserRepository;

    /**
     * Scheduled task that runs daily to clean up anonymous users based on configured retention
     * policy. This follows Supabase's recommendation for anonymous user cleanup.
     */
    @Transactional
    @Scheduled(cron = "0 0 2 * * ?")
    public void cleanup() {
        if (!anonEnabled) {
            return;
        }

        if (retentionDays <= 0) {
            return;
        }

        LocalDateTime cutoffDate = LocalDateTime.now().minusDays(retentionDays);
        log.info("Removing accounts created before {}", cutoffDate);

        batchDeleteSupabaseUsers(cutoffDate, batchSize);
        batchDeleteUsers(cutoffDate, batchSize);
    }

    private void batchDeleteSupabaseUsers(LocalDateTime cutoffDate, int batchSize) {
        try (Stream<UUID> idStream =
                supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(cutoffDate)) {
            AtomicInteger counter = new AtomicInteger();

            idStream.collect(Collectors.groupingBy(id -> counter.getAndIncrement() / batchSize))
                    .values()
                    .forEach(batch -> supabaseUserRepository.delete("id in ?1", batch));
        }
    }

    private void batchDeleteUsers(LocalDateTime cutoffDate, int batchSize) {
        try (Stream<Long> idStream =
                userRepository.findByUsernameIsNullAndCreatedAtBefore(cutoffDate)) {
            AtomicInteger counter = new AtomicInteger();

            idStream.collect(Collectors.groupingBy(id -> counter.getAndIncrement() / batchSize))
                    .values()
                    .forEach(batch -> userRepository.delete("id in ?1", batch));
        }
    }
}
