package stirling.software.proprietary.policy.store;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Tests for {@link JpaPolicyStore}'s entity mapping and query delegation. The repository is mocked;
 * real Hibernate/H2 persistence is exercised at application boot (this module's convention is
 * Mockito unit tests for store/service logic).
 */
@ExtendWith(MockitoExtension.class)
class JpaPolicyStoreTest {

    @Mock private PolicyRepository repository;

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private JpaPolicyStore store;

    @BeforeEach
    void setUp() {
        store = new JpaPolicyStore(repository, objectMapper);
    }

    @Test
    void saveAssignsAnIdAndPersistsThePolicyAsJson() {
        Policy saved =
                store.save(
                        new Policy(
                                null,
                                "compress incoming",
                                "alice",
                                true,
                                new TriggerConfig("schedule", Map.of()),
                                List.of("src-in"),
                                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                                OutputSpec.inline()));

        assertNotNull(saved.id());
        ArgumentCaptor<PolicyEntity> captor = ArgumentCaptor.forClass(PolicyEntity.class);
        verify(repository).save(captor.capture());
        PolicyEntity entity = captor.getValue();
        assertEquals(saved.id(), entity.getId());
        assertEquals("schedule", entity.getTriggerType());
        assertTrue(entity.isEnabled());
        // The stored JSON round-trips back to an equal policy.
        assertEquals(saved, objectMapper.readValue(entity.getPolicyJson(), Policy.class));
    }

    @Test
    void getDeserializesThePolicyFromJson() {
        Policy policy =
                new Policy(
                        "p1",
                        "rotate",
                        "alice",
                        true,
                        null, // manual-only: no automatic trigger
                        List.of(
                                new PipelineStep(
                                        "/api/v1/general/rotate-pdf", Map.of("angle", 90))),
                        OutputSpec.inline());
        when(repository.findById("p1")).thenReturn(Optional.of(entityFor(policy)));

        assertEquals(policy, store.get("p1").orElseThrow());
    }

    @Test
    void saveDenormalizesTeamIdForScopedQueries() {
        store.save(
                new Policy(
                        "p1",
                        "scoped",
                        "alice",
                        true,
                        null,
                        List.of(),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline(),
                        9L));

        ArgumentCaptor<PolicyEntity> captor = ArgumentCaptor.forClass(PolicyEntity.class);
        verify(repository).save(captor.capture());
        assertEquals(Long.valueOf(9L), captor.getValue().getTeamId());
    }

    @Test
    void findByTeamDelegatesToTheScopedQuery() {
        Policy policy =
                new Policy(
                        "p1",
                        "ours",
                        "alice",
                        true,
                        null,
                        List.of(),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline(),
                        9L);
        when(repository.findByTeam(9L)).thenReturn(List.of(entityFor(policy)));

        List<Policy> mine = store.findByTeam(9L);

        assertEquals(1, mine.size());
        assertEquals("p1", mine.get(0).id());
    }

    @Test
    void findByTriggerTypeUsesTheEnabledQuery() {
        Policy policy =
                new Policy(
                        "p1",
                        "watch",
                        "alice",
                        true,
                        new TriggerConfig("schedule", Map.of()),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline());
        when(repository.findByTriggerTypeAndEnabledTrue("schedule"))
                .thenReturn(List.of(entityFor(policy)));

        List<Policy> scheduled = store.findByTriggerType("schedule");

        assertEquals(1, scheduled.size());
        assertEquals("p1", scheduled.get(0).id());
    }

    @Test
    void deleteReturnsWhetherThePolicyExisted() {
        when(repository.existsById("p1")).thenReturn(true);
        assertTrue(store.delete("p1"));
        verify(repository).deleteById("p1");

        when(repository.existsById("missing")).thenReturn(false);
        assertFalse(store.delete("missing"));
    }

    private PolicyEntity entityFor(Policy policy) {
        PolicyEntity entity = new PolicyEntity();
        entity.setId(policy.id());
        entity.setName(policy.name());
        entity.setOwner(policy.owner());
        entity.setEnabled(policy.enabled());
        entity.setTriggerType(policy.trigger() == null ? null : policy.trigger().type());
        entity.setTeamId(policy.teamId());
        entity.setPolicyJson(objectMapper.writeValueAsString(policy));
        return entity;
    }
}
