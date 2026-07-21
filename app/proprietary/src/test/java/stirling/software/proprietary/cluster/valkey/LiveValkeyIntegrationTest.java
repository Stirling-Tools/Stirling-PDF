package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.DistributedLock;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;
import stirling.software.common.model.ApplicationProperties;

/**
 * Live integration tests against a real Valkey instance, started by Testcontainers. The
 * {@code @EnabledIf} guard probes the Docker daemon via {@link
 * DockerClientFactory#isDockerAvailable()} (non-throwing) so the suite skips cleanly when Docker is
 * unavailable - without that guard, {@code @Testcontainers} would throw {@code initializationError}
 * (test FAILURE, not skip) on CI runners without Docker.
 */
@Testcontainers
@EnabledIf("isDockerAvailable")
class LiveValkeyIntegrationTest {

    @Container
    static final GenericContainer<?> VALKEY =
            new GenericContainer<>(DockerImageName.parse("valkey/valkey:8.0-alpine"))
                    .withExposedPorts(6379);

    static boolean isDockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    private static LettuceConnectionFactory factoryA;
    private static LettuceConnectionFactory factoryB;
    private static StringRedisTemplate templateA;
    private static StringRedisTemplate templateB;

    @BeforeAll
    static void connect() {
        String host = VALKEY.getHost();
        int port = VALKEY.getMappedPort(6379);
        factoryA = new LettuceConnectionFactory(new RedisStandaloneConfiguration(host, port));
        factoryA.afterPropertiesSet();
        factoryB = new LettuceConnectionFactory(new RedisStandaloneConfiguration(host, port));
        factoryB.afterPropertiesSet();
        templateA = new StringRedisTemplate(factoryA);
        templateB = new StringRedisTemplate(factoryB);
        templateA.getConnectionFactory().getConnection().serverCommands().flushAll();
    }

    @AfterAll
    static void disconnect() {
        if (factoryA != null) factoryA.destroy();
        if (factoryB != null) factoryB.destroy();
    }

    @Test
    @DisplayName("Valkey reachable and isHealthy() = true after PING round-trip")
    void backplaneHealthy() {
        ApplicationProperties propsA = newProps("node-A");
        ValkeyClusterBackplane bp = new ValkeyClusterBackplane(propsA, templateA);
        assertEquals("valkey", bp.backplaneType());
        assertEquals("node-A", bp.localNodeId());
        assertTrue(bp.isHealthy(), "Valkey must be reachable in the Testcontainers instance");
    }

    @Test
    @DisplayName("JobStore put on connection A, get on connection B reads the same entry")
    void jobStoreCrossConnectionVisibility() {
        ValkeyJobStore storeA = new ValkeyJobStore(templateA);
        ValkeyJobStore storeB = new ValkeyJobStore(templateB);

        JobStoreEntry entry =
                new JobStoreEntry(
                        "live-job-1",
                        JobStoreEntry.JobState.RUNNING,
                        "node-A",
                        Instant.now(),
                        null,
                        null,
                        List.of("live-file-1"),
                        Map.of("k", "v"));
        storeA.put(entry, Duration.ofSeconds(30));

        Optional<JobStoreEntry> seen = storeB.get("live-job-1");
        assertTrue(seen.isPresent(), "storeB on different connection must see storeA's write");
        assertEquals("node-A", seen.get().owningNodeId());
        assertEquals(JobStoreEntry.JobState.RUNNING, seen.get().state());
        assertEquals("live-job-1", storeB.findJobIdByFileId("live-file-1").orElse(null));
    }

    @Test
    @DisplayName("JobStore entry expires after the configured duration")
    void jobStoreTtlExpires() throws InterruptedException {
        ValkeyJobStore store = new ValkeyJobStore(templateA);
        store.put(
                new JobStoreEntry(
                        "ttl-job",
                        JobStoreEntry.JobState.PENDING,
                        "node-A",
                        Instant.now(),
                        null,
                        null,
                        List.of(),
                        Map.of()),
                Duration.ofSeconds(2));
        assertTrue(store.exists("ttl-job"));
        long deadline = System.currentTimeMillis() + 3000;
        boolean expired = false;
        while (System.currentTimeMillis() < deadline) {
            if (!store.exists("ttl-job")) {
                expired = true;
                break;
            }
            Thread.sleep(100);
        }
        assertTrue(expired, "entry should TTL-expire within 3 s of a 2 s TTL");
    }

    @Test
    @DisplayName("KeyValueCache propagates across connections; evict observed cross-connection")
    void keyValueCacheCrossConnection() {
        ValkeyKeyValueCache cacheA = new ValkeyKeyValueCache(templateA);
        ValkeyKeyValueCache cacheB = new ValkeyKeyValueCache(templateB);

        cacheA.put("apikey", "hash-bob", "bob", Duration.ofSeconds(30));
        assertEquals("bob", cacheB.get("apikey", "hash-bob").orElse(null));

        cacheA.evict("apikey", "hash-bob");
        assertFalse(cacheB.get("apikey", "hash-bob").isPresent());
    }

    @Test
    @DisplayName("RateLimitStore enforces ONE global budget across two instances")
    void rateLimitGlobalAcrossInstances() {
        ValkeyRateLimitStore storeA = newRateLimitStore(factoryA);
        ValkeyRateLimitStore storeB = newRateLimitStore(factoryB);
        String key = "live-user:alice";
        long capacity = 4;

        AtomicInteger allowed = new AtomicInteger();
        for (int i = 0; i < 8; i++) {
            // alternate consumers
            var store = (i % 2 == 0) ? storeA : storeB;
            RateLimitDecision d = store.tryConsume(key, capacity, Duration.ofSeconds(30));
            if (d.allowed()) allowed.incrementAndGet();
        }
        assertEquals(
                4,
                allowed.get(),
                "exactly 4 (the global capacity) must be allowed across both instances");
    }

    @Test
    @DisplayName("DistributedLock excludes a second acquirer on a different connection")
    void distributedLockMutualExclusion() {
        ValkeyDistributedLock lockA = new ValkeyDistributedLock(templateA);
        ValkeyDistributedLock lockB = new ValkeyDistributedLock(templateB);

        Optional<DistributedLock.LockHandle> heldByA =
                lockA.tryAcquire("election-X", Duration.ofSeconds(30));
        assertTrue(heldByA.isPresent());

        Optional<DistributedLock.LockHandle> heldByB =
                lockB.tryAcquire("election-X", Duration.ofSeconds(30));
        assertFalse(heldByB.isPresent(), "second acquirer must fail while A holds the lock");

        heldByA.get().release();

        // After release, B can acquire
        Optional<DistributedLock.LockHandle> retry =
                lockB.tryAcquire("election-X", Duration.ofSeconds(30));
        assertTrue(retry.isPresent());
        retry.get().release();
    }

    @Test
    @DisplayName("renew() extends the lease TTL well beyond the original")
    void distributedLockRenewExtendsLease() {
        ValkeyDistributedLock lock = new ValkeyDistributedLock(templateA);
        String key = "renew-" + java.util.UUID.randomUUID();
        Optional<DistributedLock.LockHandle> held = lock.tryAcquire(key, Duration.ofSeconds(1));
        assertTrue(held.isPresent());

        assertTrue(held.get().renew(Duration.ofSeconds(30)), "renew on a held lock must succeed");
        Long ttlMs =
                templateA.getExpire(
                        "stirling:lock:" + key, java.util.concurrent.TimeUnit.MILLISECONDS);
        assertNotNull(ttlMs);
        assertTrue(
                ttlMs > 1500 && ttlMs <= 30_000,
                "renew must reset TTL to the new 30s lease, got " + ttlMs + " ms");
        held.get().release();
    }

    @Test
    @DisplayName("value-check prevents a stale owner from releasing/renewing a re-acquired lock")
    void distributedLockStealPrevention() throws InterruptedException {
        ValkeyDistributedLock lockA = new ValkeyDistributedLock(templateA);
        ValkeyDistributedLock lockB = new ValkeyDistributedLock(templateB);
        String key = "steal-" + java.util.UUID.randomUUID();

        Optional<DistributedLock.LockHandle> a = lockA.tryAcquire(key, Duration.ofMillis(500));
        assertTrue(a.isPresent());

        // Let A's 500ms lease TTL-expire so Valkey drops the key, then B takes a fresh lock.
        Thread.sleep(800);
        Optional<DistributedLock.LockHandle> b = lockB.tryAcquire(key, Duration.ofSeconds(30));
        assertTrue(b.isPresent(), "B must acquire after A's lease expired");

        // A's stale handle (different UUID value) must touch neither B's renew nor B's key.
        assertFalse(
                a.get().renew(Duration.ofSeconds(30)),
                "stale owner must not be able to renew a lock now owned by B");
        a.get().release(); // value-checked DEL: must be a no-op, must NOT delete B's key

        assertFalse(
                lockA.tryAcquire(key, Duration.ofMillis(100)).isPresent(),
                "B must still hold the lock; A's stale release must not have stolen it");
        b.get().release();
    }

    @Test
    @DisplayName("register is atomic (hash + TTL committed together, no orphan keys on crash)")
    void registryRegisterIsAtomic() {
        ValkeyInstanceRegistry reg = new ValkeyInstanceRegistry(templateA);
        ClusterNode node =
                new ClusterNode(
                        "atomic-node-" + java.util.UUID.randomUUID(),
                        "10.0.0.99:8080",
                        Instant.now(),
                        "BOTH");
        reg.register(node, Duration.ofSeconds(30));

        // TTL must be positive; -1 would mean EXPIRE did not commit inside MULTI/EXEC.
        Long ttlMs =
                templateA.getExpire(
                        "stirling:nodes:" + node.nodeId(),
                        java.util.concurrent.TimeUnit.MILLISECONDS);
        assertNotNull(ttlMs);
        assertTrue(
                ttlMs > 0 && ttlMs <= 30_000,
                "register() must atomically arm TTL; expected (0, 30000] ms, got " + ttlMs);

        Optional<ClusterNode> seen = reg.lookup(node.nodeId());
        assertTrue(seen.isPresent(), "hash fields must be visible after atomic register()");
        assertEquals("10.0.0.99:8080", seen.get().internalAddress());

        reg.deregister(node.nodeId());
    }

    @Test
    @DisplayName("register on connection A is visible from connection B")
    void registryCrossConnection() {
        ValkeyInstanceRegistry regA = new ValkeyInstanceRegistry(templateA);
        ValkeyInstanceRegistry regB = new ValkeyInstanceRegistry(templateB);

        ClusterNode node = new ClusterNode("live-node-7", "10.0.0.7:8080", Instant.now(), "BOTH");
        regA.register(node, Duration.ofSeconds(30));

        Optional<ClusterNode> seen = regB.lookup("live-node-7");
        assertTrue(seen.isPresent());
        assertEquals("10.0.0.7:8080", seen.get().internalAddress());

        boolean inActive =
                regB.activeNodes().stream().anyMatch(n -> "live-node-7".equals(n.nodeId()));
        assertTrue(inActive);

        regA.deregister("live-node-7");
        assertFalse(regB.lookup("live-node-7").isPresent());
    }

    @Test
    @DisplayName("Bucket4j: no fixed-window boundary doubling (parity with in-process semantics)")
    void rateLimitNoBoundaryDoubling() throws InterruptedException {
        ValkeyRateLimitStore store = newRateLimitStore(factoryA);
        String key = "boundary-" + java.util.UUID.randomUUID();
        long capacity = 5;
        Duration window = Duration.ofMillis(500);

        int firstAllowed = 0;
        for (int i = 0; i < 10; i++) {
            if (store.tryConsume(key, capacity, window).allowed()) firstAllowed++;
        }
        assertEquals(capacity, firstAllowed, "must allow exactly capacity tokens initially");

        Thread.sleep(window.toMillis() + 50);
        int secondAllowed = 0;
        long start = System.nanoTime();
        for (int i = 0; i < 20 && (System.nanoTime() - start) < 20_000_000L; i++) {
            if (store.tryConsume(key, capacity, window).allowed()) secondAllowed++;
        }
        assertTrue(
                secondAllowed <= capacity,
                "token-bucket must not let a fresh full capacity be consumed instantly across"
                        + " the boundary; got "
                        + secondAllowed);
    }

    private ValkeyRateLimitStore newRateLimitStore(LettuceConnectionFactory factory) {
        ValkeyRateLimitStore store = new ValkeyRateLimitStore(factory);
        store.initProxyManager();
        return store;
    }

    @Test
    @DisplayName("JobStore put is atomic (hash + TTL + reverse index visible together)")
    void jobStorePutIsAtomic() {
        ValkeyJobStore store = new ValkeyJobStore(templateA);
        String jobId = "atomic-job-" + java.util.UUID.randomUUID();
        String fileId = "atomic-file-" + java.util.UUID.randomUUID();
        store.put(
                new JobStoreEntry(
                        jobId,
                        JobStoreEntry.JobState.PENDING,
                        "node-A",
                        Instant.now(),
                        null,
                        null,
                        List.of(fileId),
                        Map.of("k", "v")),
                Duration.ofSeconds(30));

        assertTrue(store.exists(jobId), "hash must be visible after put");
        Long jobTtl =
                templateA.getExpire(
                        "stirling:job:" + jobId, java.util.concurrent.TimeUnit.MILLISECONDS);
        assertNotNull(jobTtl);
        assertTrue(jobTtl > 0, "hash must have TTL armed inside the same transaction");
        assertEquals(jobId, store.findJobIdByFileId(fileId).orElse(null));
        Long indexTtl =
                templateA.getExpire(
                        "stirling:file2job:" + fileId, java.util.concurrent.TimeUnit.MILLISECONDS);
        assertNotNull(indexTtl);
        assertTrue(indexTtl > 0, "reverse index must also have TTL armed");
    }

    @Test
    @DisplayName(
            "JobStore.delete(): WATCH aborts when put() races between read and EXEC, no orphaned"
                    + " reverse-index entries")
    void jobStoreDeleteWatchRaceRetriesAndCleansUp() {
        ValkeyJobStore store = new ValkeyJobStore(templateA);
        String jobId = "watch-race-job-" + java.util.UUID.randomUUID();
        String originalFile = "orig-file-" + java.util.UUID.randomUUID();
        String newFile = "new-file-" + java.util.UUID.randomUUID();

        store.put(
                new JobStoreEntry(
                        jobId,
                        JobStoreEntry.JobState.RUNNING,
                        "node-A",
                        Instant.now(),
                        null,
                        null,
                        List.of(originalFile),
                        Map.of()),
                Duration.ofSeconds(30));

        // Simulate the race: between delete()'s WATCH read and EXEC, add a new fileId.
        // The first EXEC aborts; the retry catches the new fileId and deletes both entries.
        Thread mutator =
                new Thread(
                        () -> {
                            try {
                                Thread.sleep(20);
                            } catch (InterruptedException ignored) {
                                Thread.currentThread().interrupt();
                            }
                            store.put(
                                    new JobStoreEntry(
                                            jobId,
                                            JobStoreEntry.JobState.RUNNING,
                                            "node-A",
                                            Instant.now(),
                                            null,
                                            null,
                                            List.of(originalFile, newFile),
                                            Map.of()),
                                    Duration.ofSeconds(30));
                        });
        mutator.start();

        store.delete(jobId);
        try {
            mutator.join(2000);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }

        boolean hashGone = !store.exists(jobId);
        boolean origIndexGone = !store.findJobIdByFileId(originalFile).isPresent();
        boolean newIndexGone = !store.findJobIdByFileId(newFile).isPresent();
        if (hashGone) {
            assertTrue(
                    origIndexGone,
                    "if hash is deleted, original reverse-index entry must also be gone");
            assertTrue(
                    newIndexGone,
                    "if hash is deleted after the racing put(), the WATCH retry must catch the"
                            + " new fileId and delete its reverse-index entry too");
        } else {
            assertEquals(jobId, store.findJobIdByFileId(originalFile).orElse(null));
            assertEquals(jobId, store.findJobIdByFileId(newFile).orElse(null));
        }
    }

    @Test
    @DisplayName("JobStore.delete() removes hash AND every reverse-index entry atomically")
    void jobStoreDeleteRemovesReverseIndexEntries() {
        ValkeyJobStore store = new ValkeyJobStore(templateA);
        String jobId = "del-atomic-job-" + java.util.UUID.randomUUID();
        String fileA = "del-atomic-fileA-" + java.util.UUID.randomUUID();
        String fileB = "del-atomic-fileB-" + java.util.UUID.randomUUID();
        store.put(
                new JobStoreEntry(
                        jobId,
                        JobStoreEntry.JobState.COMPLETE,
                        "node-A",
                        Instant.now(),
                        Instant.now(),
                        null,
                        List.of(fileA, fileB),
                        Map.of()),
                Duration.ofSeconds(30));
        assertTrue(store.exists(jobId));
        assertEquals(jobId, store.findJobIdByFileId(fileA).orElse(null));
        assertEquals(jobId, store.findJobIdByFileId(fileB).orElse(null));

        store.delete(jobId);

        // Both the main hash AND every reverse-index entry must be gone; dangling reverse-index
        // entries would cause findJobIdByFileId() to return a deleted jobId.
        assertFalse(store.exists(jobId), "main hash must be deleted");
        assertFalse(
                store.findJobIdByFileId(fileA).isPresent(),
                "reverse-index entry for fileA must not survive delete()");
        assertFalse(
                store.findJobIdByFileId(fileB).isPresent(),
                "reverse-index entry for fileB must not survive delete()");
        assertFalse(
                Boolean.TRUE.equals(templateA.hasKey("stirling:file2job:" + fileA)),
                "raw reverse-index key for fileA must not survive delete()");
        assertFalse(
                Boolean.TRUE.equals(templateA.hasKey("stirling:file2job:" + fileB)),
                "raw reverse-index key for fileB must not survive delete()");
    }

    @Test
    @DisplayName("JobStore.all() walks the keyspace via SCAN, not KEYS")
    void jobStoreAllUsesScanNonBlocking() {
        ValkeyJobStore store = new ValkeyJobStore(templateA);
        for (int i = 0; i < 15; i++) {
            store.put(
                    new JobStoreEntry(
                            "scan-job-" + i,
                            JobStoreEntry.JobState.PENDING,
                            "node-A",
                            Instant.now(),
                            null,
                            null,
                            List.of(),
                            Map.of()),
                    Duration.ofSeconds(30));
        }
        long observed = store.all().stream().filter(e -> e.jobId().startsWith("scan-job-")).count();
        assertTrue(
                observed >= 15,
                "SCAN-based all() must surface every inserted job, saw " + observed);
    }

    @Test
    @DisplayName("Valkey unreachable yields isHealthy() = false")
    void unreachableBackplaneReportsUnhealthy() {
        RedisStandaloneConfiguration cfg = new RedisStandaloneConfiguration("localhost", 16400);
        LettuceConnectionFactory dead = new LettuceConnectionFactory(cfg);
        dead.afterPropertiesSet();
        try {
            StringRedisTemplate t = new StringRedisTemplate(dead);
            ValkeyClusterBackplane bp = new ValkeyClusterBackplane(newProps("orphan"), t);
            assertFalse(bp.isHealthy(), "isHealthy must be false when Valkey is unreachable");
        } finally {
            dead.destroy();
        }
    }

    private ApplicationProperties newProps(String nodeId) {
        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().setEnabled(true);
        p.getCluster().setBackplane("valkey");
        p.getCluster()
                .getValkey()
                .setUrl("redis://" + VALKEY.getHost() + ":" + VALKEY.getMappedPort(6379));
        p.getCluster().getNode().setId(nodeId);
        return p;
    }
}
