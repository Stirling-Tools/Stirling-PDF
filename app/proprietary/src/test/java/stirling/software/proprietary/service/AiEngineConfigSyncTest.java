package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AiEngine;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * The config-push bridge is a self-hosted-only feature: it lets the admin UI drive the engine's
 * model/key/RAG/limit config. Environment-driven deployments pin {@code
 * aiEngine.pushConfigToEngine} false (SaaS does so in application-saas.properties) so the engine
 * stays entirely env-controlled - these tests lock in that the processor stays silent then while
 * still pushing when it is enabled.
 */
class AiEngineConfigSyncTest {

    private ApplicationProperties applicationProperties;
    private AiEngineClient aiEngineClient;
    private AiEngineConfigSync sync;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getAiEngine().setEnabled(true);
        applicationProperties.getAiEngine().setPushConfigToEngine(true);
        aiEngineClient = mock(AiEngineClient.class);
        ObjectMapper objectMapper = JsonMapper.builder().build();
        sync = new AiEngineConfigSync(applicationProperties, aiEngineClient, objectMapper);
    }

    @Test
    void startupPushSkippedWhenPushDisabled() throws Exception {
        applicationProperties.getAiEngine().setPushConfigToEngine(false);

        sync.pushConfigOnStartup();

        // Returns synchronously before spawning the push thread, so no interaction ever happens.
        verify(aiEngineClient, never()).post(anyString(), anyString(), isNull());
    }

    @Test
    void startupPushSkippedWhenDisabled() throws Exception {
        applicationProperties.getAiEngine().setEnabled(false);

        sync.pushConfigOnStartup();

        verify(aiEngineClient, never()).post(anyString(), anyString(), isNull());
    }

    @Test
    void startupPushSentWhenEnabledAndPushOn() throws Exception {
        sync.pushConfigOnStartup();

        // Push runs on a virtual thread; wait for the single POST to /api/v1/config.
        verify(aiEngineClient, timeout(3000)).post(eq("/api/v1/config"), anyString(), isNull());
    }

    @Test
    void livePushSkippedWhenPushDisabled() throws Exception {
        applicationProperties.getAiEngine().setPushConfigToEngine(false);

        sync.pushLiveAfterSave(Map.of("aiEngine.models.provider", "ollama"));

        verify(aiEngineClient, never()).post(anyString(), anyString(), isNull());
    }

    @Test
    void livePushSentForEngineRelevantChangeWhenPushOn() throws Exception {
        sync.pushLiveAfterSave(Map.of("aiEngine.models.provider", "ollama"));

        verify(aiEngineClient, timeout(3000)).post(eq("/api/v1/config"), anyString(), isNull());
    }

    @Test
    void startupPushSerialisesTheEngineWireContract() throws Exception {
        // Distinct values so a dropped/renamed field is detectable. Mirrors
        // engine/tests/fixtures/processor_config_push.json - keep the two in sync; the engine's
        // test_config_contract.py validates that same shape on the receiving side.
        AiEngine ai = applicationProperties.getAiEngine();
        ai.getModels().setProvider("ollama");
        ai.getModels().setSmartModel("smart-model-x");
        ai.getModels().setFastModel("fast-model-x");
        ai.getModels().setSmartMaxTokens(1111);
        ai.getModels().setFastMaxTokens(2222);
        ai.getModels().setApiKey("provider-key-abc");
        ai.getModels().setBaseUrl("http://engine.example/v1");
        ai.getRag().setEmbeddingProvider("custom");
        ai.getRag().setEmbeddingModel("embed-model-x");
        ai.getRag().setEmbeddingApiKey("embed-key-abc");
        ai.getRag().setEmbeddingBaseUrl("http://embed.example/v1");
        ai.getRag().setTopK(33);
        ai.getRag().setMaxSearches(7);
        ai.getLimits().setMaxPages(111);
        ai.getLimits().setMaxCharacters(222222);
        ai.getLimits().setModelMaxConcurrency(9);

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        sync.pushConfigOnStartup();
        verify(aiEngineClient, timeout(3000)).post(eq("/api/v1/config"), body.capture(), isNull());

        JsonNode root = JsonMapper.builder().build().readTree(body.getValue());

        JsonNode models = root.get("models");
        assertEquals("ollama", models.get("provider").asText());
        assertEquals("smart-model-x", models.get("smartModel").asText());
        assertEquals("fast-model-x", models.get("fastModel").asText());
        assertEquals(1111, models.get("smartMaxTokens").asInt());
        assertEquals(2222, models.get("fastMaxTokens").asInt());
        assertEquals("provider-key-abc", models.get("apiKey").asText());
        assertEquals("http://engine.example/v1", models.get("baseUrl").asText());

        JsonNode rag = root.get("rag");
        assertEquals("custom", rag.get("embeddingProvider").asText());
        assertEquals("embed-model-x", rag.get("embeddingModel").asText());
        assertEquals("embed-key-abc", rag.get("embeddingApiKey").asText());
        assertEquals("http://embed.example/v1", rag.get("embeddingBaseUrl").asText());
        assertEquals(33, rag.get("topK").asInt());
        assertEquals(7, rag.get("maxSearches").asInt());

        JsonNode limits = root.get("limits");
        assertEquals(111, limits.get("maxPages").asInt());
        assertEquals(222222, limits.get("maxCharacters").asInt());
        assertEquals(9, limits.get("modelMaxConcurrency").asInt());
    }

    @Test
    void livePushSkippedForNonEngineRelevantChange() throws Exception {
        // features.* is processor-side only; no engine push is warranted.
        sync.pushLiveAfterSave(Map.of("aiEngine.features.chat", false));

        verify(aiEngineClient, never()).post(anyString(), anyString(), isNull());
    }
}
