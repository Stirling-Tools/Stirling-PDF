package stirling.software.common.configuration;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import com.posthog.java.PostHog;

import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import lombok.extern.slf4j.Slf4j;

@ApplicationScoped
@Slf4j
public class PostHogConfig {

    @ConfigProperty(name = "posthog.api.key")
    String posthogApiKey;

    @ConfigProperty(name = "posthog.host")
    String posthogHost;

    private PostHog postHogClient;

    @Produces
    @ApplicationScoped
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
