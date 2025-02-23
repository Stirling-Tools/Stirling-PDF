package stirling.software.SPDF.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.posthog.java.PostHog;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

@Configuration
@Slf4j
public class PostHogConfig {

    @Value("${posthog.api.key}")
    private String posthogApiKey;

    @Value("${posthog.host}")
    private String posthogHost;

    private PostHog postHogClient;

    @Bean
    public PostHog postHogClient() {
        postHogClient =
                new PostHog.Builder(posthogApiKey)
                        .host(posthogHost)
                        .logger(new PostHogLoggerImpl())
                        .build();
        return postHogClient;
    }

    @PreDestroy
    public void shutdownPostHog() {
        if (postHogClient != null) {
            postHogClient.shutdown();
        }
    }
}
