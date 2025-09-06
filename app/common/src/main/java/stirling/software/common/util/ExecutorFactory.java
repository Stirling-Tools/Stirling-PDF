package stirling.software.common.util;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class ExecutorFactory {

    /**
     * Creates an ExecutorService using virtual threads if available (Java 21+), or falls back to a
     * cached thread pool on older Java versions.
     */
    public static ExecutorService newVirtualOrCachedThreadExecutor() {
        try {
            ExecutorService executor =
                    (ExecutorService)
                            Executors.class
                                    .getMethod("newVirtualThreadPerTaskExecutor")
                                    .invoke(null);
            return executor;
        } catch (NoSuchMethodException e) {
            log.debug("Virtual threads not available; falling back to cached thread pool.");
        } catch (Exception e) {
            log.debug("Error initializing virtual thread executor: {}", e.getMessage(), e);
        }

        return Executors.newCachedThreadPool();
    }
}
