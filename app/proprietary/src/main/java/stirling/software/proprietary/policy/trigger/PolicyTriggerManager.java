package stirling.software.proprietary.policy.trigger;

import java.util.List;

import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Starts and stops every {@link PolicyTrigger} with the application lifecycle. Background triggers
 * (schedule, and future folder/S3) begin watching on {@link #start()} and release resources on
 * {@link #stop()}; request-driven triggers (manual) are no-ops.
 *
 * <p>This is the single activation point for triggers - a new background trigger only has to be a
 * {@link PolicyTrigger} bean.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyTriggerManager implements SmartLifecycle {

    private final List<PolicyTrigger> triggers;

    private volatile boolean running;

    @Override
    public void start() {
        for (PolicyTrigger trigger : triggers) {
            try {
                trigger.start();
            } catch (RuntimeException e) {
                log.error("Failed to start trigger '{}': {}", trigger.type(), e.getMessage(), e);
            }
        }
        running = true;
    }

    @Override
    public void stop() {
        for (PolicyTrigger trigger : triggers) {
            try {
                trigger.stop();
            } catch (RuntimeException e) {
                log.error("Failed to stop trigger '{}': {}", trigger.type(), e.getMessage(), e);
            }
        }
        running = false;
    }

    @Override
    public boolean isRunning() {
        return running;
    }
}
