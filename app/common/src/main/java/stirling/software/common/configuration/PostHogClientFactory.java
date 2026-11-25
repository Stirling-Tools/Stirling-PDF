package stirling.software.common.configuration;

import com.posthog.java.PostHog;

/**
 * Creates PostHog clients on demand. Every created client starts and owns a "PostHog QueueManager
 * thread", so callers must {@link PostHog#shutdown() shutdown} the client they create when it is no
 * longer needed.
 */
@FunctionalInterface
public interface PostHogClientFactory {

    PostHog create();
}
