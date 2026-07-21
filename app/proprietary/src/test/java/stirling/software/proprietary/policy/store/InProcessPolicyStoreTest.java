package stirling.software.proprietary.policy.store;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;

/** Tests for {@link InProcessPolicyStore}: id assignment, upsert, trigger-type lookup, delete. */
class InProcessPolicyStoreTest {

    private PolicyStore store;

    @BeforeEach
    void setUp() {
        store = new InProcessPolicyStore();
    }

    @Test
    void savedPolicyGetsAnIdAndIsRetrievable() {
        Policy saved = store.save(policy(null, "compress", null, true));

        assertNotNull(saved.id());
        assertFalse(saved.id().isBlank());
        assertEquals(saved, store.get(saved.id()).orElseThrow());
    }

    @Test
    void savingWithAnExistingIdUpdatesInPlace() {
        Policy created = store.save(policy(null, "before", null, true));

        store.save(
                new Policy(
                        created.id(),
                        "after",
                        "owner",
                        true,
                        null,
                        List.of(),
                        OutputSpec.inline()));

        assertEquals(1, store.all().size());
        assertEquals("after", store.get(created.id()).orElseThrow().name());
    }

    @Test
    void findByTriggerTypeReturnsOnlyEnabledMatches() {
        store.save(policy(null, "nightly", "schedule", true));
        store.save(policy(null, "nightly-disabled", "schedule", false));
        store.save(policy(null, "hooked", "webhook", true));
        store.save(policy(null, "on-demand", null, true)); // manual-only: no trigger

        List<Policy> scheduled = store.findByTriggerType("schedule");

        assertEquals(1, scheduled.size());
        assertEquals("nightly", scheduled.get(0).name());
    }

    @Test
    void deleteRemovesThePolicy() {
        Policy saved = store.save(policy(null, "p", null, true));

        assertTrue(store.delete(saved.id()));
        assertTrue(store.get(saved.id()).isEmpty());
        assertFalse(store.delete(saved.id()));
    }

    private static Policy policy(String id, String name, String triggerType, boolean enabled) {
        TriggerConfig trigger =
                triggerType == null ? null : new TriggerConfig(triggerType, Map.of());
        return new Policy(
                id,
                name,
                "owner",
                enabled,
                trigger,
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }
}
