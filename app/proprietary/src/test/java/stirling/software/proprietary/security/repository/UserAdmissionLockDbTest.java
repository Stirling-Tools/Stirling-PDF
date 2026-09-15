package stirling.software.proprietary.security.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import stirling.software.proprietary.model.UserLicenseSettings;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

/**
 * Admission against the licensed user limit is a count followed by an insert. Unless the two are
 * serialised, two requests arriving at the last free seat both see room and both insert, leaving
 * the instance over the limit its licence was bought for.
 *
 * <p>This drives that race against a real (H2) database: two transactions on separate threads, each
 * taking the licence lock, counting, and inserting only if there is room. The lock is what makes
 * the loser observe the winner's insert, so the seat count settles on the cap rather than one past
 * it.
 */
@DataJpaTest
@Transactional(propagation = Propagation.NOT_SUPPORTED) // each thread runs its own transaction
class UserAdmissionLockDbTest {

    private static final int CAP = 2;

    @Autowired private UserLicenseSettingsRepository settingsRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PlatformTransactionManager txManager;

    @BeforeEach
    void seedLicenceRowAndFillToOneFreeSeat() {
        UserLicenseSettings settings = new UserLicenseSettings();
        settings.setId(UserLicenseSettings.SINGLETON_ID);
        settings.setGrandfatheredUserCount(CAP);
        settings.setLicenseMaxUsers(0);
        settings.setGrandfatheringLocked(false);
        settings.setIntegritySalt(UUID.randomUUID().toString());
        settings.setGrandfatheredUserSignature("");
        settingsRepository.save(settings);

        userRepository.save(user("seat-1"));
    }

    @Test
    void twoConcurrentAdmissionsCannotBothTakeTheLastSeat() throws Exception {
        CountDownLatch bothReady = new CountDownLatch(2);
        AtomicInteger admitted = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 2; i++) {
                String username = "racer-" + i;
                pool.submit(
                        () -> {
                            // Line both threads up so they contend for the lock, not for the clock.
                            bothReady.countDown();
                            bothReady.await(5, TimeUnit.SECONDS);
                            new TransactionTemplate(txManager)
                                    .executeWithoutResult(
                                            status -> {
                                                settingsRepository.lockSettings();
                                                if (userRepository.count() < CAP) {
                                                    userRepository.save(user(username));
                                                    admitted.incrementAndGet();
                                                }
                                            });
                            return null;
                        });
            }
            pool.shutdown();
            assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdownNow();
        }

        assertThat(admitted.get()).isEqualTo(1);
        assertThat(userRepository.count()).isEqualTo(CAP);
    }

    private static User user(String username) {
        User u = new User();
        u.setUsername(username);
        return u;
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.proprietary.security.database.repository",
                "stirling.software.proprietary.security.repository"
            })
    static class TestApp {}
}
