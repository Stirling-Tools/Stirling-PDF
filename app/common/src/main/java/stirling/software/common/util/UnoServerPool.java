package stirling.software.common.util;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

import stirling.software.common.model.ApplicationProperties;

public class UnoServerPool {

    private static final long READY_PROBE_INTERVAL_MILLIS = 250;
    private static final int READY_PROBE_CONNECT_TIMEOUT_MILLIS = 500;

    private final List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints;
    private final BlockingQueue<Integer> availableIndices;

    public UnoServerPool(List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints) {
        if (endpoints == null || endpoints.isEmpty()) {
            this.endpoints = Collections.emptyList();
            this.availableIndices = new LinkedBlockingQueue<>();
        } else {
            this.endpoints = new ArrayList<>(endpoints);
            this.availableIndices = new LinkedBlockingQueue<>();
            // Initialize queue with all endpoint indices
            for (int i = 0; i < this.endpoints.size(); i++) {
                this.availableIndices.offer(i);
            }
        }
    }

    public boolean isEmpty() {
        return endpoints.isEmpty();
    }

    public boolean hasLocalEndpoints() {
        if (endpoints.isEmpty()) {
            return true;
        }
        for (ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep : endpoints) {
            if (isLocalEndpoint(ep)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isLocalEndpoint(
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep) {
        if (ep == null) {
            return true;
        }
        String loc = ep.getHostLocation();
        if ("remote".equalsIgnoreCase(loc)) {
            return false;
        }
        if ("local".equalsIgnoreCase(loc)) {
            return true;
        }
        String host = ep.getHost();
        if (host == null || host.isBlank()) {
            return true;
        }
        host = host.trim().toLowerCase(Locale.ROOT);
        return "127.0.0.1".equals(host) || "localhost".equals(host) || "::1".equals(host);
    }

    /**
     * Waits until one local endpoint accepts a TCP connection, or the timeout passes. Returns true
     * immediately for a remote-only pool, which has nothing to wake. Callers use this after
     * signalling demand so the first conversion after an idle shutdown does not race the server
     * that is still starting.
     */
    public boolean waitForLocalEndpoint(long timeout, TimeUnit unit) throws InterruptedException {
        List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> locals = new ArrayList<>();
        if (endpoints.isEmpty()) {
            locals.add(defaultEndpoint());
        } else {
            for (ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint : endpoints) {
                if (isLocalEndpoint(endpoint)) {
                    locals.add(endpoint);
                }
            }
        }
        if (locals.isEmpty()) {
            return true;
        }

        long deadline = System.nanoTime() + unit.toNanos(timeout);
        while (true) {
            for (ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint : locals) {
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) {
                    return false;
                }
                if (canConnect(endpoint, remaining)) {
                    return true;
                }
            }
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0) {
                return false;
            }
            Thread.sleep(clampedSleepMillis(remaining));
        }
    }

    /**
     * Waits until the given endpoint accepts a TCP connection, or the timeout passes. Remote
     * endpoints return true immediately. Callers that already hold a lease use this so the probe
     * and the leased endpoint are the same one.
     */
    public boolean waitForEndpoint(
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint,
            long timeout,
            TimeUnit unit)
            throws InterruptedException {
        if (!isLocalEndpoint(endpoint)) {
            return true;
        }
        long deadline = System.nanoTime() + unit.toNanos(timeout);
        while (true) {
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0) {
                return false;
            }
            if (canConnect(endpoint, remaining)) {
                return true;
            }
            remaining = deadline - System.nanoTime();
            if (remaining <= 0) {
                return false;
            }
            Thread.sleep(clampedSleepMillis(remaining));
        }
    }

    /** Probe with the connect timeout clamped to the caller's remaining budget. */
    private static boolean canConnect(
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint, long remainingNanos) {
        if (endpoint == null || endpoint.getHost() == null) {
            return false;
        }
        int connectTimeoutMillis =
                (int)
                        Math.max(
                                1,
                                Math.min(
                                        READY_PROBE_CONNECT_TIMEOUT_MILLIS,
                                        TimeUnit.NANOSECONDS.toMillis(remainingNanos)));
        try (Socket socket = new Socket()) {
            socket.connect(
                    new InetSocketAddress(endpoint.getHost(), endpoint.getPort()),
                    connectTimeoutMillis);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private static long clampedSleepMillis(long remainingNanos) {
        return Math.min(
                READY_PROBE_INTERVAL_MILLIS,
                Math.max(1, TimeUnit.NANOSECONDS.toMillis(remainingNanos)));
    }

    public UnoServerLease acquireEndpoint() throws InterruptedException {
        if (endpoints.isEmpty()) {
            return new UnoServerLease(defaultEndpoint(), null, this);
        }

        // Block until an endpoint index becomes available
        Integer index = availableIndices.take();
        return new UnoServerLease(endpoints.get(index), index, this);
    }

    /** Fail-fast variant; non-positive timeout falls back to unbounded acquire. */
    public UnoServerLease acquireEndpoint(long timeout, TimeUnit unit)
            throws InterruptedException, TimeoutException {
        if (endpoints.isEmpty()) {
            return new UnoServerLease(defaultEndpoint(), null, this);
        }
        if (timeout <= 0) {
            return acquireEndpoint();
        }

        Integer index = availableIndices.poll(timeout, unit);
        if (index == null) {
            throw new TimeoutException(
                    "Timed out waiting for a free unoserver endpoint after "
                            + timeout
                            + " "
                            + unit.name().toLowerCase(Locale.ROOT));
        }
        return new UnoServerLease(endpoints.get(index), index, this);
    }

    private void releaseEndpoint(Integer index) {
        if (index != null) {
            availableIndices.offer(index);
        }
    }

    private static ApplicationProperties.ProcessExecutor.UnoServerEndpoint defaultEndpoint() {
        return new ApplicationProperties.ProcessExecutor.UnoServerEndpoint();
    }

    public static class UnoServerLease implements AutoCloseable {
        private final ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint;
        private final Integer index;
        private final UnoServerPool pool;
        private final AtomicBoolean closed = new AtomicBoolean(false);

        public UnoServerLease(
                ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint,
                Integer index,
                UnoServerPool pool) {
            this.endpoint = endpoint;
            this.index = index;
            this.pool = pool;
        }

        public ApplicationProperties.ProcessExecutor.UnoServerEndpoint getEndpoint() {
            return endpoint;
        }

        @Override
        public void close() {
            // Idempotent close: only release once even if close() called multiple times
            if (!closed.compareAndSet(false, true)) {
                return;
            }
            if (pool != null && index != null) {
                pool.releaseEndpoint(index);
            }
        }
    }
}
