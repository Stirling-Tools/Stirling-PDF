package stirling.software.proprietary.policy.trigger;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.policy.model.PolicyBinding;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Tests for {@link PolicyTriggerManager}: triggers run only while they have enabled bindings, the
 * set reconciles on policy changes, and individual failures never block the others.
 */
@ExtendWith(MockitoExtension.class)
class PolicyTriggerManagerTest {

    @Mock private PolicyTrigger triggerA;
    @Mock private PolicyTrigger triggerB;
    @Mock private PolicyStore policyStore;
    @Mock private PolicyBinding binding;

    @BeforeEach
    void setUp() {
        when(triggerA.type()).thenReturn("a");
        when(triggerB.type()).thenReturn("b");
    }

    private PolicyTriggerManager manager() {
        return new PolicyTriggerManager(List.of(triggerA, triggerB), policyStore);
    }

    @Test
    void startsAndStopsTriggersWithBindings() {
        when(policyStore.findBindingsByTriggerType(anyString())).thenReturn(List.of(binding));
        PolicyTriggerManager manager = manager();
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
    void leavesTriggersStoppedWithoutBindings() {
        when(policyStore.findBindingsByTriggerType(anyString())).thenReturn(List.of());

        PolicyTriggerManager manager = manager();
        manager.start();

        verify(triggerA, never()).start();
        verify(triggerB, never()).start();
        assertTrue(manager.isRunning());
    }

    @Test
    void startsTriggersWhenBindingsAppear() {
        when(policyStore.findBindingsByTriggerType(anyString())).thenReturn(List.of());
        PolicyTriggerManager manager = manager();
        manager.start();

        when(policyStore.findBindingsByTriggerType("a")).thenReturn(List.of(binding));
        manager.notifyPoliciesChanged();

        verify(triggerA).start();
        verify(triggerA).onPoliciesChanged();
        verify(triggerB, never()).start();
    }

    @Test
    void stopsTriggersWhenBindingsDisappear() {
        when(policyStore.findBindingsByTriggerType(anyString())).thenReturn(List.of(binding));
        PolicyTriggerManager manager = manager();
        manager.start();

        when(policyStore.findBindingsByTriggerType("a")).thenReturn(List.of());
        manager.notifyPoliciesChanged();

        verify(triggerA).stop();
        verify(triggerB, never()).stop();
    }

    @Test
    void ignoresPolicyChangesAfterStop() {
        when(policyStore.findBindingsByTriggerType(anyString())).thenReturn(List.of(binding));
        PolicyTriggerManager manager = manager();
        manager.start();
        manager.stop();
        clearInvocations(triggerA, triggerB);

        manager.notifyPoliciesChanged();

        verify(triggerA, never()).start();
        verify(triggerB, never()).start();
        verify(triggerA, never()).onPoliciesChanged();
    }

    @Test
    void oneTriggerFailingToStartDoesNotBlockTheOthers() {
        when(policyStore.findBindingsByTriggerType(anyString())).thenReturn(List.of(binding));
        doThrow(new RuntimeException("boom")).when(triggerA).start();

        PolicyTriggerManager manager = manager();
        manager.start();

        verify(triggerB).start();
        assertTrue(manager.isRunning());
    }

    @Test
    void aFailedStopStaysTrackedSoTheNextReconcileRetriesIt() {
        when(policyStore.findBindingsByTriggerType(anyString())).thenReturn(List.of(binding));
        PolicyTriggerManager manager = manager();
        manager.start();

        doThrow(new RuntimeException("boom")).doNothing().when(triggerA).stop();
        when(policyStore.findBindingsByTriggerType("a")).thenReturn(List.of());
        manager.notifyPoliciesChanged();
        clearInvocations(triggerA);

        manager.notifyPoliciesChanged();

        verify(triggerA).stop();
    }

    @Test
    void storeFailureStartsTheTriggersRatherThanDisablingAutomation() {
        when(policyStore.findBindingsByTriggerType(anyString()))
                .thenThrow(new RuntimeException("db down"));

        PolicyTriggerManager manager = manager();
        manager.start();

        verify(triggerA).start();
        verify(triggerB).start();
    }
}
