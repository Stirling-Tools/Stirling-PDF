package stirling.software.common.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import stirling.software.common.service.PostHogClient;

@Configuration
public class PostHogConfig {

    @Value("${posthog.api.key}")
    private String posthogApiKey;

    @Value("${posthog.host}")
    private String posthogHost;

    @Bean(destroyMethod = "shutdown")
    public PostHogClient postHogClient() {
        return new PostHogClient(posthogApiKey, posthogHost);
    }
}
