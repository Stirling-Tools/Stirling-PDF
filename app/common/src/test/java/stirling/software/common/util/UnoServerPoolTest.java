package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

public class UnoServerPoolTest {

    @Test
    void testEmptyPool() throws InterruptedException {
        UnoServerPool pool = new UnoServerPool(Collections.emptyList());
        assertTrue(pool.isEmpty(), "Pool with empty list should be empty");

        UnoServerPool.UnoServerLease lease = pool.acquireEndpoint();
        assertNotNull(lease, "Should return a default lease for empty pool");
        assertNotNull(lease.getEndpoint(), "Default lease should have an endpoint");
        lease.close(); // Should not throw
    }

    @Test
    void testSingleEndpointAcquireRelease() throws InterruptedException {
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints =
                createEndpoints(1);
        UnoServerPool pool = new UnoServerPool(endpoints);
        assertFalse(pool.isEmpty(), "Pool should not be empty");

        UnoServerPool.UnoServerLease lease = pool.acquireEndpoint();
        assertNotNull(lease, "Should acquire endpoint");
        assertEquals("127.0.0.1", lease.getEndpoint().getHost());
        assertEquals(2003, lease.getEndpoint().getPort());

        lease.close();
    }

    @Test
    void testMultipleEndpointsDistribution() throws InterruptedException {
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints =
                createEndpoints(3);
        UnoServerPool pool = new UnoServerPool(endpoints);

        List<Integer> portsUsed = new ArrayList<>();

        // Acquire all endpoints
        try (UnoServerPool.UnoServerLease lease1 = pool.acquireEndpoint();
                UnoServerPool.UnoServerLease lease2 = pool.acquireEndpoint();
                UnoServerPool.UnoServerLease lease3 = pool.acquireEndpoint()) {

            portsUsed.add(lease1.getEndpoint().getPort());
            portsUsed.add(lease2.getEndpoint().getPort());
            portsUsed.add(lease3.getEndpoint().getPort());

            // All three endpoints should be in use (different ports)
            assertEquals(3, portsUsed.stream().distinct().count(), "Should use all 3 endpoints");
        }
        // All released after try-with-resources
    }

    @Test
    void testConcurrentAccess() throws InterruptedException {
        int endpointCount = 3;
        int threadCount = 10;
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints =
                createEndpoints(endpointCount);
        UnoServerPool pool = new UnoServerPool(endpoints);

        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);
        AtomicInteger successCount = new AtomicInteger(0);

        for (int i = 0; i < threadCount; i++) {
            executor.submit(
                    () -> {
                        try {
                            startLatch.await(); // Wait for all threads to be ready
                            UnoServerPool.UnoServerLease lease = pool.acquireEndpoint();
                            assertNotNull(lease, "Should acquire endpoint");
                            Thread.sleep(10); // Simulate work
                            lease.close();
                            successCount.incrementAndGet();
                        } catch (Exception e) {
                            fail("Thread failed: " + e.getMessage());
                        } finally {
                            doneLatch.countDown();
                        }
                    });
        }

        startLatch.countDown(); // Start all threads
        boolean finished = doneLatch.await(5, TimeUnit.SECONDS);
        executor.shutdown();

        assertTrue(finished, "All threads should complete within timeout");
        assertEquals(
                threadCount, successCount.get(), "All threads should successfully acquire/release");
    }

    @Test
    void testBlockingBehavior() throws InterruptedException {
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints =
                createEndpoints(2);
        UnoServerPool pool = new UnoServerPool(endpoints);

        // Acquire both endpoints
        UnoServerPool.UnoServerLease lease1 = pool.acquireEndpoint();
        UnoServerPool.UnoServerLease lease2 = pool.acquireEndpoint();

        AtomicInteger acquired = new AtomicInteger(0);
        CountDownLatch acquireLatch = new CountDownLatch(1);

        // Try to acquire a third endpoint in separate thread (should block)
        Thread blockingThread =
                new Thread(
                        () -> {
                            try {
                                acquireLatch.countDown(); // Signal we're about to block
                                UnoServerPool.UnoServerLease lease3 = pool.acquireEndpoint();
                                acquired.incrementAndGet();
                                lease3.close();
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            }
                        });

        blockingThread.start();
        acquireLatch.await(); // Wait for thread to start
        Thread.sleep(100); // Give it time to block

        // Should still be 0 because thread is blocked
        assertEquals(0, acquired.get(), "Third acquire should be blocked");

        // Release one endpoint
        lease1.close();
        Thread.sleep(100); // Give blocked thread time to acquire

        // Now the third acquire should succeed
        assertEquals(1, acquired.get(), "Third acquire should succeed after release");

        lease2.close();
        blockingThread.join(1000);
        assertFalse(blockingThread.isAlive(), "Thread should complete");
    }

    @Test
    void testEndpointReuse() throws InterruptedException {
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints =
                createEndpoints(1);
        UnoServerPool pool = new UnoServerPool(endpoints);

        int port1, port2;

        try (UnoServerPool.UnoServerLease lease1 = pool.acquireEndpoint()) {
            port1 = lease1.getEndpoint().getPort();
        }

        try (UnoServerPool.UnoServerLease lease2 = pool.acquireEndpoint()) {
            port2 = lease2.getEndpoint().getPort();
        }

        assertEquals(port1, port2, "Should reuse the same endpoint after release");
    }

    @Test
    void testHostLocationAndProtocol() throws InterruptedException {
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints = new ArrayList<>();
        ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint =
                new ApplicationProperties.ProcessExecutor.UnoServerEndpoint();
        endpoint.setHost("remote.server");
        endpoint.setPort(8080);
        endpoint.setHostLocation("remote");
        endpoint.setProtocol("https");
        endpoints.add(endpoint);

        UnoServerPool pool = new UnoServerPool(endpoints);

        try (UnoServerPool.UnoServerLease lease = pool.acquireEndpoint()) {
            assertEquals("remote.server", lease.getEndpoint().getHost());
            assertEquals(8080, lease.getEndpoint().getPort());
            assertEquals("remote", lease.getEndpoint().getHostLocation());
            assertEquals("https", lease.getEndpoint().getProtocol());
        }
    }

    private List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> createEndpoints(
            int count) {
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint =
                    new ApplicationProperties.ProcessExecutor.UnoServerEndpoint();
            endpoint.setHost("127.0.0.1");
            endpoint.setPort(2003 + (i * 2));
            endpoints.add(endpoint);
        }
        return endpoints;
    }
}
