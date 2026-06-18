package stirling.software.proprietary.policy.trigger;

import java.util.List;

import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Starts and stops every {@link PolicyTrigger} with the application lifecycle. */
@Slf4j
@Service
@RequiredArgsConstructor
@Profile("saas")
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
