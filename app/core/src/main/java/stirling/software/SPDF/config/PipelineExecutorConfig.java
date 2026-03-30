package stirling.software.SPDF.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class PipelineExecutorConfig {

    @Bean(name = "pipelineExecutor", destroyMethod = "shutdown")
    public ExecutorService pipelineExecutor() {
        int threads = Math.max(2, Runtime.getRuntime().availableProcessors());
        return Executors.newFixedThreadPool(
                threads,
                r -> {
                    Thread t = new Thread(r, "pipeline-job");
                    t.setDaemon(false);
                    return t;
                });
    }
}
