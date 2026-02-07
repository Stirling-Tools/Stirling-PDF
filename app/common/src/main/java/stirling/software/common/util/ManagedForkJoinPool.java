package stirling.software.common.util;

import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.TimeUnit;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class ManagedForkJoinPool implements AutoCloseable {
    private final ForkJoinPool pool;

    public ManagedForkJoinPool(int parallelism) {
        this.pool = new ForkJoinPool(parallelism);
    }

    public ForkJoinPool getPool() {
        return pool;
    }

    @Override
    public void close() {
        pool.shutdown();
        try {
            if (!pool.awaitTermination(60, TimeUnit.SECONDS)) {
                pool.shutdownNow();
                if (!pool.awaitTermination(60, TimeUnit.SECONDS)) {
                    log.warn("ForkJoinPool did not terminate within timeout");
                }
            }
        } catch (InterruptedException e) {
            pool.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
