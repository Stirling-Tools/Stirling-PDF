package stirling.software.proprietary.policy.trigger;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Starts and stops every {@link PolicyTrigger} with the application lifecycle.
 *
 * <p>Triggers that have no enabled binding are left stopped, so a default install with no policies
 * runs no sweepers. Policy changes reconcile the set, and a store failure starts the trigger rather
 * than silently disabling an automation.
 *
 * <p>Lifecycle transitions and reconciliation share this instance's monitor, so a policy change
 * cannot interleave with a stop and leave a trigger in a state that matches neither.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyTriggerManager implements SmartLifecycle {

    private final List<PolicyTrigger> triggers;
    private final PolicyStore policyStore;

    private final Set<PolicyTrigger> started = ConcurrentHashMap.newKeySet();
    private volatile boolean running;

    @Override
    public synchronized void start() {
        running = true;
        reconcileTriggers();
    }

    @Override
    public synchronized void stop() {
        running = false;
        for (PolicyTrigger trigger : triggers) {
            stopTrigger(trigger);
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    /**
     * Tell every running trigger that the policy set changed so cached registrations refresh
     * promptly instead of waiting for the next periodic reconcile. Best-effort and idempotent: a
     * failing trigger is logged and the rest still run; a no-op before the subsystem has started.
     */
    public synchronized void notifyPoliciesChanged() {
        if (!running) {
            return;
        }
        reconcileTriggers();
        for (PolicyTrigger trigger : started) {
            try {
                trigger.onPoliciesChanged();
            } catch (RuntimeException e) {
                log.error(
                        "Failed to refresh trigger '{}' after policy change: {}",
                        trigger.type(),
                        e.getMessage(),
                        e);
            }
        }
    }

    private void reconcileTriggers() {
        for (PolicyTrigger trigger : triggers) {
            if (hasBindings(trigger)) {
                startTrigger(trigger);
            } else {
                stopTrigger(trigger);
            }
        }
    }

    private boolean hasBindings(PolicyTrigger trigger) {
        try {
            return !policyStore.findBindingsByTriggerType(trigger.type()).isEmpty();
        } catch (RuntimeException e) {
            log.warn(
                    "Could not read '{}' policy bindings; starting the trigger anyway: {}",
                    trigger.type(),
                    e.getMessage());
            return true;
        }
    }

    private void startTrigger(PolicyTrigger trigger) {
        if (!started.add(trigger)) {
            return;
        }
        try {
            trigger.start();
        } catch (RuntimeException e) {
            started.remove(trigger);
            log.error("Failed to start trigger '{}': {}", trigger.type(), e.getMessage(), e);
        }
    }

    private void stopTrigger(PolicyTrigger trigger) {
        if (!started.remove(trigger)) {
            return;
        }
        try {
            trigger.stop();
        } catch (RuntimeException e) {
            log.error("Failed to stop trigger '{}': {}", trigger.type(), e.getMessage(), e);
        }
    }
}
