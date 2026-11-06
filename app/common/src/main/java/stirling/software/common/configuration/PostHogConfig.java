package stirling.software.common.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.posthog.java.HttpSender;
import com.posthog.java.PostHog;
import com.posthog.java.QueueManager;
import com.posthog.java.Sender;

@Configuration
public class PostHogConfig {

    /**
     * The SDK's queue manager polls its queue every 100 ms by default. Telemetry tolerates seconds
     * of latency, so poll ten times less often and cut the thread's wakeups accordingly.
     */
    private static final int QUEUE_POLL_INTERVAL_MS = 1_000;

    /**
     * Building the sender and queue manager directly (instead of the plain {@code PostHog.Builder})
     * is what allows the poll interval override; the sender keeps the same configuration the plain
     * builder would produce.
     */
    @Bean
    public PostHogClientFactory postHogClientFactory(
            @Value("${posthog.api.key}") String apiKey,
            @Value("${posthog.host}") String host,
            PostHogLoggerImpl postHogLogger) {
        return () -> {
            Sender sender = new HttpSender.Builder(apiKey).host(host).logger(postHogLogger).build();
            QueueManager queueManager =
                    new QueueManager.Builder(sender).sleepMs(QUEUE_POLL_INTERVAL_MS).build();
            return new PostHog.BuilderWithCustomQueueManager(queueManager, sender).build();
        };
    }
}
