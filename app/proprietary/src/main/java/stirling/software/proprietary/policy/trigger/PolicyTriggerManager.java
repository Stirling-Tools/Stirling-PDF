package stirling.software.proprietary.policy.trigger;

import io.quarkus.arc.profile.IfBuildProfile;
import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

/**
 * Starts and stops every {@link PolicyTrigger} with the application lifecycle. Background triggers
 * (schedule, and future folder/S3) begin watching on startup and release resources on shutdown;
 * request-driven triggers (manual) are no-ops.
 *
 * <p>This is the single activation point for triggers - a new background trigger only has to be a
 * {@link PolicyTrigger} bean.
 */
@Slf4j
@ApplicationScoped
@IfBuildProfile("saas")
public class PolicyTriggerManager {

    @Inject Instance<PolicyTrigger> triggers;

    private volatile boolean running;

    public void start(@Observes StartupEvent event) {
        for (PolicyTrigger trigger : triggers) {
            try {
                trigger.start();
            } catch (RuntimeException e) {
                log.error("Failed to start trigger '{}': {}", trigger.type(), e.getMessage(), e);
            }
        }
        running = true;
    }

    public void stop(@Observes ShutdownEvent event) {
        for (PolicyTrigger trigger : triggers) {
            try {
                trigger.stop();
            } catch (RuntimeException e) {
                log.error("Failed to stop trigger '{}': {}", trigger.type(), e.getMessage(), e);
            }
        }
        running = false;
    }

    public boolean isRunning() {
        return running;
    }
}
