package stirling.software.common.util;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
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
            // Initialize queue with all endpoint indices
            for (int i = 0; i < this.endpoints.size(); i++) {
                this.availableIndices.offer(i);
            }
        }
    }

    public boolean isEmpty() {
        return endpoints.isEmpty();
    }

    public UnoServerLease acquireEndpoint() throws InterruptedException {
        if (endpoints.isEmpty()) {
            return new UnoServerLease(defaultEndpoint(), null, this);
        }

        // Block until an endpoint index becomes available
        Integer index = availableIndices.take();
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
