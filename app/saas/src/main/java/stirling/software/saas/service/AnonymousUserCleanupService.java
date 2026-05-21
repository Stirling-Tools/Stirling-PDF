package stirling.software.saas.service;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.saas.repository.SupabaseUserRepository;

/**
 * Service to periodically clean up anonymous users older than 30 days. Based on Supabase's
 * recommendation for anonymous user management.
 */
@Slf4j
@Service
@Profile("saas")
@RequiredArgsConstructor
public class AnonymousUserCleanupService {

    @Value("${app.auth.anonymous.enabled:true}")
    private boolean anonEnabled;

    @Value("${app.auth.anonymous.retention-days:30}")
    private int retentionDays;

    @Value("${app.auth.anonymous.cleanup-batch-size:100}")
    private int batchSize;

    private final UserRepository userRepository;
    private final SupabaseUserRepository supabaseUserRepository;

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
                    .forEach(supabaseUserRepository::deleteAllByIdInBatch);
        }
    }

    private void batchDeleteUsers(LocalDateTime cutoffDate, int batchSize) {
        try (Stream<Long> idStream =
                userRepository.findByUsernameIsNullAndCreatedAtBefore(cutoffDate)) {
            AtomicInteger counter = new AtomicInteger();

            idStream.collect(Collectors.groupingBy(id -> counter.getAndIncrement() / batchSize))
                    .values()
                    .forEach(userRepository::deleteAllByIdInBatch);
        }
    }
}
