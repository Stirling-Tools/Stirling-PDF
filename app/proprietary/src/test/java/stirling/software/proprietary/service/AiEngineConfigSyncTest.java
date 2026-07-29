package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import java.util.HashMap;
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
 * Config-push bridge is self-hosted-only. These lock in that the processor stays silent when {@code
 * aiEngine.pushConfigToEngine} is off (env-driven/SaaS) and pushes when it is on.
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
        // Distinct values so a dropped/renamed field is detectable. Keep in sync with
        // engine/tests/fixtures/processor_config_push.json (the engine validates the same shape).
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

    @Test
    void startupPushKeepsEnvWhenSectionsUnconfigured() throws Exception {
        // All defaults, no credentials: the push must NOT override the engine's env-configured
        // provider/model/embedder, so the identity fields are blanked ("keep env" on the engine).
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        sync.pushConfigOnStartup();
        verify(aiEngineClient, timeout(3000)).post(eq("/api/v1/config"), body.capture(), isNull());

        JsonNode root = JsonMapper.builder().build().readTree(body.getValue());
        assertEquals("", root.get("models").get("provider").asText());
        assertEquals("", root.get("models").get("smartModel").asText());
        assertEquals("", root.get("models").get("fastModel").asText());
        assertEquals("", root.get("rag").get("embeddingProvider").asText());
        assertEquals("", root.get("rag").get("embeddingModel").asText());
    }

    @Test
    void startupPushSendsProviderWhenChangedFromDefault() throws Exception {
        // Admin selected a non-default provider (relying on the engine's env key): send it so the
        // engine actually switches provider, even though no API key was entered in the UI.
        applicationProperties.getAiEngine().getModels().setProvider("openai");

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        sync.pushConfigOnStartup();
        verify(aiEngineClient, timeout(3000)).post(eq("/api/v1/config"), body.capture(), isNull());

        JsonNode models = JsonMapper.builder().build().readTree(body.getValue()).get("models");
        assertEquals("openai", models.get("provider").asText());
    }

    @Test
    void startupPushSendsModelsWhenApiKeyConfigured() throws Exception {
        // A configured key means the admin is driving models from the UI: send the full section.
        applicationProperties.getAiEngine().getModels().setApiKey("sk-real-key");

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        sync.pushConfigOnStartup();
        verify(aiEngineClient, timeout(3000)).post(eq("/api/v1/config"), body.capture(), isNull());

        JsonNode models = JsonMapper.builder().build().readTree(body.getValue()).get("models");
        assertEquals("anthropic", models.get("provider").asText());
        assertEquals("sk-real-key", models.get("apiKey").asText());
    }

    @Test
    void livePushSendsAnExplicitlyClearedApiKeyRatherThanKeepEnv() throws Exception {
        // Clearing a leaked key must reach the engine as a real clear; blanking it as "keep env"
        // would leave the revoked key live in the engine's cache indefinitely.
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        sync.pushLiveAfterSave(mapOf("aiEngine.models.apiKey", ""));
        verify(aiEngineClient, timeout(3000)).post(eq("/api/v1/config"), body.capture(), isNull());

        JsonNode models = JsonMapper.builder().build().readTree(body.getValue()).get("models");
        assertEquals("", models.get("apiKey").asText());
        // Identity was NOT blanked wholesale: the provider still travels so the engine applies
        // the cleared credential against the right provider.
        assertEquals("anthropic", models.get("provider").asText());
    }

    @Test
    void livePushKeepsEnvWhenOnlyANumericKnobChanged() throws Exception {
        // The admin touched a limit, not the identity, so the engine's env-configured
        // provider/model must be preserved.
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        sync.pushLiveAfterSave(Map.of("aiEngine.limits.maxPages", 42));
        verify(aiEngineClient, timeout(3000)).post(eq("/api/v1/config"), body.capture(), isNull());

        JsonNode root = JsonMapper.builder().build().readTree(body.getValue());
        assertEquals("", root.get("models").get("provider").asText());
        assertEquals("", root.get("models").get("apiKey").asText());
        assertEquals(42, root.get("limits").get("maxPages").asInt());
    }

    @Test
    void livePushIgnoresAMalformedKeyInsteadOfClobberingTheSection() throws Exception {
        // "aiEngine.models." has no leaf; writing at the section name would replace the whole
        // models object with a scalar and produce an unparseable push.
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        sync.pushLiveAfterSave(mapOf("aiEngine.models.", "junk"));
        verify(aiEngineClient, timeout(3000)).post(eq("/api/v1/config"), body.capture(), isNull());

        JsonNode models = JsonMapper.builder().build().readTree(body.getValue()).get("models");
        assertTrue(models.isObject(), "models must still be an object");
    }

    @Test
    void livePushNeverThrowsIntoTheCaller() throws Exception {
        // The caller has already persisted settings.yml, so a push-building failure must not
        // surface as a failed save. A null value inside the map is enough to break naive code.
        Map<String, Object> pending = new HashMap<>();
        pending.put("aiEngine.models.provider", null);

        assertDoesNotThrow(() -> sync.pushLiveAfterSave(pending));
    }

    /** {@link Map#of} rejects nulls and we need entries with empty/odd values. */
    private static Map<String, Object> mapOf(String key, Object value) {
        Map<String, Object> map = new HashMap<>();
        map.put(key, value);
        return map;
    }
}
