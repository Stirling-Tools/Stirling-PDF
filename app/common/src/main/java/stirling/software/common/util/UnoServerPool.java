package stirling.software.common.util;

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

    private final List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints;
    private final BlockingQueue<Integer> availableIndices;

    public UnoServerPool(List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints) {
        if (endpoints == null || endpoints.isEmpty()) {
            this.endpoints = Collections.emptyList();
            this.availableIndices = new LinkedBlockingQueue<>();
        } else {
            this.endpoints = new ArrayList<>(endpoints);
            this.availableIndices = new LinkedBlockingQueue<>();
            for (int i = 0; i < this.endpoints.size(); i++) {
                for (int slot = 0; slot < slotsFor(this.endpoints.get(i)); slot++) {
                    this.availableIndices.offer(i);
                }
            }
        }
    }

    public boolean isEmpty() {
        return endpoints.isEmpty();
    }

    public int totalSlots() {
        int total = 0;
        for (ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint : endpoints) {
            total += slotsFor(endpoint);
        }
        return total;
    }

    private static int slotsFor(ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint) {
        return Math.max(1, endpoint.getConcurrency());
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
