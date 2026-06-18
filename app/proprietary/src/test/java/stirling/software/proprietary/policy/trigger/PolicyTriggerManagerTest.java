package stirling.software.proprietary.policy.trigger;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Tests for {@link PolicyTriggerManager}: starts/stops every trigger, tolerating individual
 * failures.
 */
@ExtendWith(MockitoExtension.class)
class PolicyTriggerManagerTest {

    @Mock private PolicyTrigger triggerA;
    @Mock private PolicyTrigger triggerB;

    @Test
    void startsAndStopsAllTriggers() {
        PolicyTriggerManager manager = new PolicyTriggerManager(List.of(triggerA, triggerB));
        assertFalse(manager.isRunning());

        manager.start();
        verify(triggerA).start();
        verify(triggerB).start();
        assertTrue(manager.isRunning());

        manager.stop();
        verify(triggerA).stop();
        verify(triggerB).stop();
        assertFalse(manager.isRunning());
    }

    @Test
    void oneTriggerFailingToStartDoesNotBlockTheOthers() {
        doThrow(new RuntimeException("boom")).when(triggerA).start();
        PolicyTriggerManager manager = new PolicyTriggerManager(List.of(triggerA, triggerB));

        manager.start();

        verify(triggerB).start();
        assertTrue(manager.isRunning());
    }
}
