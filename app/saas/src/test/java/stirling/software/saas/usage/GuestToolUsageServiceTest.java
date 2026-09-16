package stirling.software.saas.usage;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

@DataJpaTest(
        properties = {
            "spring.jpa.show-sql=false",
            "spring.jpa.properties.hibernate.default_schema=PUBLIC",
            "spring.jpa.properties.hibernate.hbm2ddl.schema_filter_provider=org.hibernate.tool.schema.internal.DefaultSchemaFilterProvider"
        })
@Import(GuestToolUsageService.class)
@ActiveProfiles("saas")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class GuestToolUsageServiceTest {
    @Autowired GuestToolUsageService usage;
    @Autowired UserRepository users;
    private Long userId;

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setUsername("guest-" + java.util.UUID.randomUUID());
        userId = users.saveAndFlush(user).getId();
    }

    @Test
    void sixthExecutionIsRejectedAndFailureReturnsOneSlot() {
        for (int i = 0; i < 5; i++) assertThat(usage.reserve(userId)).isTrue();
        assertThat(usage.reserve(userId)).isFalse();
        usage.release(userId);
        assertThat(usage.reserve(userId)).isTrue();
        assertThat(usage.reserve(userId)).isFalse();
    }

    @Test
    void parallelRequestsShareFiveLifetimeSlots() throws Exception {
        try (var executor = Executors.newFixedThreadPool(8)) {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Boolean>> attempts = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                attempts.add(
                        executor.submit(
                                () -> {
                                    start.await();
                                    return usage.reserve(userId);
                                }));
            }
            start.countDown();
            int admitted = 0;
            for (Future<Boolean> attempt : attempts) {
                if (attempt.get(20, TimeUnit.SECONDS)) admitted++;
            }
            assertThat(admitted).isEqualTo(5);
        }
    }

    @Test
    void deletedGuestsDoNotLeaveUsageRows() {
        assertThat(usage.reserve(userId)).isTrue();
        users.deleteById(userId);
        assertThat(usage.reserve(userId)).isFalse();
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model",
                "stirling.software.saas.usage"
            })
    @EnableJpaRepositories(basePackageClasses = UserRepository.class)
    static class TestApp {}
}
