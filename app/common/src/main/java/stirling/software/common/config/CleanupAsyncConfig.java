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
            @Override
            public void rejectedExecution(Runnable r, ThreadPoolExecutor executor) {
                log.warn("Cleanup task rejected - queue full! Active: {}, Queue size: {}, Pool size: {}",
                    executor.getActiveCount(),
                    executor.getQueue().size(),
                    executor.getPoolSize());
                
                // Use caller-runs policy as fallback - this will block the scheduler thread
                // but ensures the cleanup still happens
                log.warn("Executing cleanup task on scheduler thread as fallback");
                r.run();
            }
        });
        
        exec.initialize();
        return exec;
    }
}
