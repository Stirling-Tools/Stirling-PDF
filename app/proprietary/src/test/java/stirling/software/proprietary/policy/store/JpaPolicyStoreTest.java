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

import stirling.software.proprietary.policy.model.EditorConfig;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyBinding;
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
                                List.of(
                                        new PipelineInput(
                                                "src-in", new TriggerConfig("schedule", Map.of()))),
                                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                                OutputSpec.inline()));

        assertNotNull(saved.id());
        ArgumentCaptor<PolicyEntity> captor = ArgumentCaptor.forClass(PolicyEntity.class);
        verify(repository).save(captor.capture());
        PolicyEntity entity = captor.getValue();
        assertEquals(saved.id(), entity.getId());
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
                        List.of(), // no inputs: run on demand only
                        List.of(
                                new PipelineStep(
                                        "/api/v1/general/rotate-pdf", Map.of("angle", 90))),
                        OutputSpec.inline());
        when(repository.findById("p1")).thenReturn(Optional.of(entityFor(policy)));

        assertEquals(policy, store.get("p1").orElseThrow());
    }

    @Test
    void getUpgradesLegacyTriggerAndSourceIdsToPerInputTriggers() {
        // A blob written before triggers moved onto inputs: one policy-level trigger + sourceIds.
        String legacyJson =
                "{\"id\":\"p1\",\"name\":\"legacy\",\"owner\":\"alice\",\"enabled\":true,"
                        + "\"trigger\":{\"type\":\"schedule\",\"options\":{}},"
                        + "\"sourceIds\":[\"s1\",\"s2\"],\"steps\":[],"
                        + "\"output\":{\"type\":\"inline\",\"options\":{}}}";
        PolicyEntity entity = new PolicyEntity();
        entity.setId("p1");
        entity.setName("legacy");
        entity.setEnabled(true);
        entity.setPolicyJson(legacyJson);
        when(repository.findById("p1")).thenReturn(Optional.of(entity));

        Policy upgraded = store.get("p1").orElseThrow();

        assertEquals(
                List.of(
                        new PipelineInput("s1", new TriggerConfig("schedule", Map.of())),
                        new PipelineInput("s2", new TriggerConfig("schedule", Map.of()))),
                upgraded.inputs());
    }

    /**
     * The regression this guards: before the editor lift, a blob written by the pre-{@code editor}
     * seeder deserialized straight onto {@link EditorConfig#disabled()}, silently taking every
     * upgraded install's Classification policy off the editor.
     *
     * <p>The {@code inputs} variant is the important one - {@link
     * JpaPolicyStore#upgradeLegacyShape} returns early on it, so a lift living inside that method
     * would miss exactly the rows written between the trigger migration and this field.
     */
    @Test
    void getLiftsALegacyEditorSourceOntoEditorConfigWhenInputsArePresent() {
        Policy lifted = readLegacy(legacyJson("\"inputs\":[],", "\"sources\":[\"editor\"],"));

        assertEquals(EditorConfig.onUpload(), lifted.editor());
        assertEquals(Optional.of("upload"), lifted.editorRunOn());
    }

    @Test
    void getLiftsALegacyEditorSourceOnThePreInputsShapeToo() {
        // Oldest shape: policy-level trigger + sourceIds, so both migrations have to compose.
        Policy lifted =
                readLegacy(
                        legacyJson(
                                "\"trigger\":{\"type\":\"schedule\",\"options\":{}},"
                                        + "\"sourceIds\":[\"s1\"],",
                                "\"sources\":[\"editor\"],"));

        assertEquals(EditorConfig.onUpload(), lifted.editor());
        assertEquals(
                List.of(new PipelineInput("s1", new TriggerConfig("schedule", Map.of()))),
                lifted.inputs());
    }

    @Test
    void getTreatsAnUnnarrowedCataloguePolicyAsEditorRun() {
        // Empty and absent both meant "nobody narrowed it", which the editor read as its own.
        assertTrue(readLegacy(legacyJson("\"inputs\":[],", "\"sources\":[],")).editor().allowed());
        assertTrue(readLegacy(legacyJson("\"inputs\":[],", "")).editor().allowed());
    }

    @Test
    void getLeavesACataloguePolicyScopedElsewhereOffTheEditor() {
        Policy lifted = readLegacy(legacyJson("\"inputs\":[],", "\"sources\":[\"sharepoint\"],"));

        assertFalse(lifted.editor().allowed());
        assertEquals(Optional.empty(), lifted.editorRunOn());
    }

    @Test
    void getLeavesASourcelessBuilderPipelineOffTheEditor() {
        // No categoryId: a pipeline built on the Pipelines page, which never reached the editor.
        String json =
                "{\"id\":\"p1\",\"name\":\"legacy\",\"enabled\":true,\"inputs\":[],"
                        + "\"steps\":[],\"output\":{\"type\":\"inline\",\"options\":{}}}";

        assertFalse(readLegacy(json).editor().allowed());
    }

    @Test
    void getKeepsTheCategoryDefaultMomentWhenNoRunOnWasStored() {
        // Security enforced on export before runOn was persisted (frontend runOn.ts
        // DEFAULT_RUN_ON).
        String json =
                "{\"id\":\"p1\",\"name\":\"legacy\",\"enabled\":true,\"inputs\":[],"
                        + "\"steps\":[],\"output\":{\"type\":\"inline\",\"options\":{"
                        + "\"categoryId\":\"security\",\"sources\":[\"editor\"]}}}";

        assertEquals(EditorConfig.onExport(), readLegacy(json).editor());
    }

    @Test
    void getNeverOverridesAnExplicitlyStoredEditorBlock() {
        // A deliberate opt-out survives, so the lift stays safe to leave in permanently.
        String json =
                "{\"id\":\"p1\",\"name\":\"legacy\",\"enabled\":true,\"inputs\":[],"
                        + "\"steps\":[],\"editor\":{\"allowed\":false,\"runOn\":\"upload\"},"
                        + "\"output\":{\"type\":\"inline\",\"options\":{"
                        + "\"categoryId\":\"classification\",\"sources\":[\"editor\"]}}}";

        assertFalse(readLegacy(json).editor().allowed());
    }

    /**
     * Pins the wire shape the stubbed Playwright spec hardcodes: the derived block is additive, so
     * a real response carries it alongside the untouched legacy options bag.
     */
    @Test
    void getLeavesTheLegacyOptionsBagIntactSoTheResponseCarriesBoth() {
        Policy lifted = readLegacy(legacyJson("\"inputs\":[],", "\"sources\":[\"editor\"],"));

        assertEquals(List.of("editor"), lifted.output().options().get("sources"));
        String wire = objectMapper.writeValueAsString(lifted);
        assertTrue(
                wire.contains("\"editor\":{\"allowed\":true,\"runOn\":\"upload\"}"),
                "expected the derived editor block on the wire, got: " + wire);
    }

    /**
     * The blob main's DefaultClassificationPolicySeeder wrote, with the shape bits parameterised.
     */
    private static String legacyJson(String shapeFields, String sourcesField) {
        return "{\"id\":\"p1\",\"name\":\"Classification Policy\",\"owner\":\"system\","
                + "\"enabled\":true,"
                + shapeFields
                + "\"steps\":[{\"operation\":\"/api/v1/ai/tools/classify-and-label\","
                + "\"parameters\":{}}],"
                + "\"output\":{\"type\":\"inline\",\"options\":{"
                + "\"categoryId\":\"classification\",\"runOn\":\"upload\","
                + "\"mode\":\"new_version\","
                + sourcesField
                + "\"scopeTypes\":[],\"reviewerEmail\":\"\"}},\"teamId\":1}";
    }

    private Policy readLegacy(String policyJson) {
        PolicyEntity entity = new PolicyEntity();
        entity.setId("p1");
        entity.setName("legacy");
        entity.setEnabled(true);
        entity.setPolicyJson(policyJson);
        when(repository.findById("p1")).thenReturn(Optional.of(entity));
        return store.get("p1").orElseThrow();
    }

    @Test
    void saveDenormalizesTeamIdForScopedQueries() {
        store.save(
                new Policy(
                        "p1",
                        "scoped",
                        "alice",
                        true,
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
    void findBindingsByTriggerTypeScansEnabledPoliciesForMatchingInputs() {
        Policy policy =
                new Policy(
                        "p1",
                        "watch",
                        "alice",
                        true,
                        List.of(
                                new PipelineInput(
                                        "src-in", new TriggerConfig("schedule", Map.of())),
                                PipelineInput.manual("src-manual")),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        OutputSpec.inline());
        when(repository.findByEnabledTrue()).thenReturn(List.of(entityFor(policy)));

        List<PolicyBinding> scheduled = store.findBindingsByTriggerType("schedule");

        // Only the scheduled input yields a binding; the manual input on the same policy does not.
        assertEquals(1, scheduled.size());
        assertEquals("p1", scheduled.get(0).policy().id());
        assertEquals("src-in", scheduled.get(0).input().sourceId());
        assertEquals("schedule", scheduled.get(0).input().trigger().type());
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
        entity.setTeamId(policy.teamId());
        entity.setPolicyJson(objectMapper.writeValueAsString(policy));
        return entity;
    }
}
