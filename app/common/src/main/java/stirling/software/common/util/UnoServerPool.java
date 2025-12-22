package stirling.software.common.util;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;

import stirling.software.common.model.ApplicationProperties;

public class UnoServerPool {

    private final List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints;
    private final List<Semaphore> semaphores;
    private final AtomicInteger nextIndex = new AtomicInteger();

    public UnoServerPool(List<ApplicationProperties.ProcessExecutor.UnoServerEndpoint> endpoints) {
        if (endpoints == null || endpoints.isEmpty()) {
            this.endpoints = Collections.emptyList();
            this.semaphores = Collections.emptyList();
        } else {
            this.endpoints = new ArrayList<>(endpoints);
            this.semaphores = buildSemaphores(this.endpoints.size());
        }
    }

    public boolean isEmpty() {
        return endpoints.isEmpty();
    }

    public UnoServerLease acquireEndpoint() throws InterruptedException {
        if (endpoints.isEmpty()) {
            return new UnoServerLease(defaultEndpoint(), null);
        }

        int size = endpoints.size();
        int startIndex = Math.floorMod(nextIndex.getAndIncrement(), size);
        for (int i = 0; i < size; i++) {
            int index = (startIndex + i) % size;
            Semaphore semaphore = semaphores.get(index);
            if (semaphore.tryAcquire()) {
                return new UnoServerLease(endpoints.get(index), semaphore);
            }
        }

        Semaphore semaphore = semaphores.get(startIndex);
        semaphore.acquire();
        return new UnoServerLease(endpoints.get(startIndex), semaphore);
    }

    private static ApplicationProperties.ProcessExecutor.UnoServerEndpoint defaultEndpoint() {
        return new ApplicationProperties.ProcessExecutor.UnoServerEndpoint();
    }

    private static List<Semaphore> buildSemaphores(int count) {
        List<Semaphore> list = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            list.add(new Semaphore(1, true));
        }
        return list;
    }

    public static class UnoServerLease implements AutoCloseable {
        private final ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint;
        private final Semaphore semaphore;

        public UnoServerLease(
                ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint,
                Semaphore semaphore) {
            this.endpoint = endpoint;
            this.semaphore = semaphore;
        }

        public ApplicationProperties.ProcessExecutor.UnoServerEndpoint getEndpoint() {
            return endpoint;
        }

        @Override
        public void close() {
            if (semaphore != null) {
                semaphore.release();
            }
        }
    }
}
