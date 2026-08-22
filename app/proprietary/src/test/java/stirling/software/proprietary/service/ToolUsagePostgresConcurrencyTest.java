package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.ToolChainStat;
import stirling.software.proprietary.model.ToolUsageStat;
import stirling.software.proprietary.repository.ToolChainStatRepository;
import stirling.software.proprietary.repository.ToolUsageStatRepository;

/**
 * Multi-node safety: several application instances share one Postgres, so every write path has to
 * survive concurrent callers on separate connections. Runs against real Postgres because the
 * behaviour under test - a failed insert aborting its transaction, and row-level locking of {@code
 * count = count + 1} - is database-specific and cannot be trusted from H2 alone. Skipped when
 * Docker is unavailable.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers(disabledWithoutDocker = true)
class ToolUsagePostgresConcurrencyTest {

    private static final String NONE = ToolUsageStat.NO_PREVIOUS_TOOL;
    private static final int NODES = 16;
    private static final int RUNS_PER_NODE = 25;

    /** A single input document: fresh, or one that has already been compressed. */
    private static final List<List<String>> FRESH = List.of(List.of());

    private static final List<List<String>> AFTER_COMPARE = List.of(List.of("compare"));

    @Container
    static PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "create-drop");
    }

    @Autowired private ToolUsageStatRepository usageRepository;
    @Autowired private ToolChainStatRepository chainRepository;

    private ToolUsageTrackingService trackingService;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().setEnableAnalytics(true);
        trackingService =
                new ToolUsageTrackingService(usageRepository, chainRepository, properties);
    }

    /** Runs {@code task} on {@code NODES} threads at once; returns how many threw. */
    private static int race(int threads, Runnable task) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        AtomicInteger failures = new AtomicInteger();
        for (int i = 0; i < threads; i++) {
            pool.submit(
                    () -> {
                        try {
                            start.await();
                            task.run();
                        } catch (Exception e) {
                            failures.incrementAndGet();
                        } finally {
                            done.countDown();
                        }
                    });
        }
        start.countDown();
        assertThat(done.await(60, TimeUnit.SECONDS)).isTrue();
        pool.shutdownNow();
        return failures.get();
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("simultaneous nodes creating the day's first row lose no counts")
    void concurrentFirstRunOfDayKeepsEveryCount() throws InterruptedException {
        usageRepository.deleteAll();
        long day = ToolUsageTrackingService.currentEpochDay();

        // Every thread starts with no row present, so they all take the insert path at once:
        // exactly one wins the primary key and the rest must fall back to incrementing.
        int failures = race(NODES, () -> trackingService.recordUsage("alice", "compress", FRESH));

        assertThat(failures).isZero();
        List<ToolUsageStat> rows = usageRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getCount()).isEqualTo(NODES);
        assertThat(rows.get(0).getFromTool()).isEqualTo(NONE);
        assertThat(rows.get(0).getEpochDay()).isEqualTo(day);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("sustained concurrent writes tally exactly, with no lost updates")
    void concurrentIncrementsAreLossless() throws InterruptedException {
        usageRepository.deleteAll();
        chainRepository.deleteAll();

        int failures =
                race(
                        NODES,
                        () -> {
                            for (int i = 0; i < RUNS_PER_NODE; i++) {
                                trackingService.recordUsage("alice", "ocr", AFTER_COMPARE);
                            }
                        });

        assertThat(failures).isZero();
        List<ToolUsageStat> rows = usageRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getCount()).isEqualTo((long) NODES * RUNS_PER_NODE);
        assertThat(rows.get(0).getFromTool()).isEqualTo("compare");
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("chain rows survive the same first-of-day insert race as usage rows")
    void concurrentChainWritesKeepEveryCount() throws InterruptedException {
        chainRepository.deleteAll();
        long day = ToolUsageTrackingService.currentEpochDay();

        int failures =
                race(NODES, () -> trackingService.recordUsage("alice", "ocr", AFTER_COMPARE));

        assertThat(failures).isZero();
        List<ToolChainStat> rows = chainRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getChainKey()).isEqualTo("compare>ocr");
        assertThat(rows.get(0).getChainLength()).isEqualTo(2);
        assertThat(rows.get(0).getCount()).isEqualTo(NODES);
        assertThat(rows.get(0).getEpochDay()).isEqualTo(day);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("the native chain insert matches the schema Hibernate generates on Postgres")
    void nativeChainInsertMatchesGeneratedSchema() {
        chainRepository.deleteAll();
        long day = ToolUsageTrackingService.currentEpochDay();

        chainRepository.insertCount("alice", "compare>ocr", day, 2, 3);

        List<ToolChainStat> rows = chainRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getCount()).isEqualTo(3);
        assertThat(rows.get(0).getChainLength()).isEqualTo(2);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("the retention sweep is idempotent when every node runs it together")
    void concurrentRetentionSweepsAreIdempotent() throws InterruptedException {
        usageRepository.deleteAll();
        long day = ToolUsageTrackingService.currentEpochDay();
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", day - 400, 5));
        usageRepository.save(new ToolUsageStat("alice", NONE, "ocr", day, 7));

        int failures = race(NODES, () -> trackingService.cleanupOldStats());

        assertThat(failures).isZero();
        List<ToolUsageStat> rows = usageRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getCount()).isEqualTo(7);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("the native insert matches the schema Hibernate generates on Postgres")
    void nativeInsertMatchesGeneratedSchema() {
        usageRepository.deleteAll();
        long day = ToolUsageTrackingService.currentEpochDay();

        usageRepository.insertCount("alice", "compare", "ocr", day, 3);

        List<ToolUsageStat> rows = usageRepository.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getCount()).isEqualTo(3);
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model",
                "stirling.software.proprietary.access.model"
            })
    @EnableJpaRepositories(basePackages = {"stirling.software.proprietary.repository"})
    static class TestApp {}
}
