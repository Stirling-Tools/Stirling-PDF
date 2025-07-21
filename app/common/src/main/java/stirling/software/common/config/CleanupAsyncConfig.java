package stirling.software.common.config;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.ThreadPoolExecutor;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import lombok.extern.slf4j.Slf4j;

@Configuration
@EnableAsync
@Slf4j
public class CleanupAsyncConfig {

    @Bean(name = "cleanupExecutor")
    public Executor cleanupExecutor() {
        ThreadPoolTaskExecutor exec = new ThreadPoolTaskExecutor();
        exec.setCorePoolSize(1);
        exec.setMaxPoolSize(1);
        exec.setQueueCapacity(100);
        exec.setThreadNamePrefix("cleanup-");
        
        // Set custom rejection handler to log when queue is full
        exec.setRejectedExecutionHandler(new RejectedExecutionHandler() {
            private volatile long lastRejectionTime = 0;
            private volatile int rejectionCount = 0;
            
            @Override
            public void rejectedExecution(Runnable r, ThreadPoolExecutor executor) {
                long currentTime = System.currentTimeMillis();
                rejectionCount++;
                
                // Rate-limit logging to avoid spam
                if (currentTime - lastRejectionTime > 60000) { // Log at most once per minute
                    log.warn("Cleanup task rejected #{} - queue full! Active: {}, Queue size: {}, Pool size: {}",
                        rejectionCount,
                        executor.getActiveCount(),
                        executor.getQueue().size(),
                        executor.getPoolSize());
                    lastRejectionTime = currentTime;
                }
                
                // Try to discard oldest task and add this one
                if (executor.getQueue().poll() != null) {
                    log.debug("Discarded oldest queued cleanup task to make room");
                    try {
                        executor.execute(r);
                        return;
                    } catch (Exception e) {
                        // If still rejected, fall back to caller-runs
                    }
                }
                
                // Last resort: caller-runs with timeout protection
                log.warn("Executing cleanup task #{} on scheduler thread as last resort", rejectionCount);
                long startTime = System.currentTimeMillis();
                try {
                    r.run();
                    long duration = System.currentTimeMillis() - startTime;
                    if (duration > 30000) { // Warn if cleanup blocks scheduler for >30s
                        log.warn("Cleanup task on scheduler thread took {}ms - consider tuning", duration);
                    }
                } catch (Exception e) {
                    log.error("Cleanup task failed on scheduler thread", e);
                }
            }
        });
        
        exec.initialize();
        return exec;
    }
}
