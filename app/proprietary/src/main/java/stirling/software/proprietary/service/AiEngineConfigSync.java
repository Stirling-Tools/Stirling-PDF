package stirling.software.proprietary.service;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AiEngine;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Pushes the admin-configured AI settings (model provider/name, per-provider API key, RAG choices,
 * limits) to the Python engine so a self-hosted deployment can drive the engine's model and API key
 * from the Stirling settings UI. Pushed on processor startup and again live whenever AI settings
 * are saved (so model/RAG/limit changes apply without a restart). The engine applies it live
 * (rebuilds its models) and caches it, so it self-restores on its own reboot. Empty
 * key/baseUrl/model fields mean "keep the engine's own environment credential".
 *
 * <p>Gated by {@code aiEngine.pushConfigToEngine} (default true). Environment-driven deployments
 * pin it false (SaaS does so in application-saas.properties) so the engine stays entirely
 * env-controlled and the processor never pushes settings-derived config to it. Best-effort and
 * non-blocking: a slow or unreachable engine never delays or fails Stirling startup.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiEngineConfigSync {

    private static final int MAX_ATTEMPTS = 5;
    private static final long RETRY_DELAY_MS = 3000L;

    private final ApplicationProperties applicationProperties;
    private final AiEngineClient aiEngineClient;
    private final ObjectMapper objectMapper;

    // Single worker so pushes are strictly ordered; see submit(). Virtual threads are always
    // daemon and unmount on the retry sleeps, so a pending push never holds up shutdown.
    private final ExecutorService pushExecutor =
            Executors.newSingleThreadExecutor(
                    Thread.ofVirtual().name("ai-engine-config-sync").factory());

    @PreDestroy
    void shutdown() {
        pushExecutor.shutdownNow();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void pushConfigOnStartup() {
        AiEngine cfg = applicationProperties.getAiEngine();
        if (!cfg.isEnabled()) {
            return;
        }
        if (!cfg.isPushConfigToEngine()) {
            log.debug(
                    "Skipping AI engine config push: aiEngine.pushConfigToEngine is disabled"
                            + " (the engine is configured from its own environment)");
            return;
        }
        // Engine may still be booting; push off the startup thread with a few retries so we never
        // block or crash Stirling startup when the engine is slow or briefly unreachable.
        submit(() -> pushWithRetries(cfg));
    }

    /**
     * Push AI settings to the engine immediately after an admin save so model/RAG/limit changes
     * reach the engine without waiting for a processor restart. {@code pendingAiEngine} are the
     * pending {@code aiEngine.*} dot-notation changes; the running bean overlaid with these is the
     * current settings.yml state. No-op unless AI is enabled and an engine-relevant key changed.
     */
    public void pushLiveAfterSave(Map<String, Object> pendingAiEngine) {
        // The caller has already persisted settings.yml, so nothing in here may propagate: a
        // failure to build or dispatch the push must not turn a successful save into a 500.
        try {
            // Gate on the RUNNING bean: AiEngineClient refuses calls while the bean is disabled, so
            // pushing on a pending-but-not-restarted enable would always fail. The post-restart
            // startup push covers first-time enablement.
            AiEngine cfg = applicationProperties.getAiEngine();
            if (pendingAiEngine == null
                    || pendingAiEngine.isEmpty()
                    || !cfg.isPushConfigToEngine()
                    || !cfg.isEnabled()) {
                return;
            }
            Set<String> engineKeys =
                    pendingAiEngine.keySet().stream()
                            .filter(AiEngineConfigSync::isEngineRelevantKey)
                            .collect(Collectors.toSet());
            if (engineKeys.isEmpty()) {
                return;
            }
            ObjectNode node = buildConfigNode(cfg);
            pendingAiEngine.forEach((k, v) -> overlayIfEngineRelevant(node, k, v));
            keepEnvForUnconfiguredIdentity(node, engineKeys);
            String body = node.toString();
            submit(() -> pushOnce(body));
        } catch (Exception e) {
            log.warn(
                    "Could not build the live AI engine config push: {} (settings were saved; the"
                            + " engine will re-sync on the next restart)",
                    e.getMessage(),
                    e);
        }
    }

    /**
     * Run a push on the single-threaded executor. Serialising them matters because each push
     * carries the FULL config and the engine persists whatever lands last: two overlapping pushes
     * (a double-clicked Save, two admin tabs, or a save racing the startup retries) could otherwise
     * leave the engine running - and caching - the older of the two.
     */
    private void submit(Runnable task) {
        pushExecutor.execute(task);
    }

    private void pushOnce(String body) {
        try {
            aiEngineClient.post("/api/v1/config", body, null);
            log.info("Pushed AI engine configuration after settings change");
        } catch (Exception e) {
            log.error(
                    "Live AI engine config push failed: {}. The engine keeps running its previous"
                            + " configuration; if the engine is not on localhost, set"
                            + " STIRLING_ENGINE_SHARED_SECRET on both the engine and the processor"
                            + " so it accepts the push.",
                    e.getMessage());
        }
    }

    // Only models/rag/limits are forwarded to the engine; enabled/url/timeouts/features are
    // processor-side and don't need a live engine push.
    private static boolean isEngineRelevantKey(String key) {
        return key.startsWith("aiEngine.models.")
                || key.startsWith("aiEngine.rag.")
                || key.startsWith("aiEngine.limits.");
    }

    private void overlayIfEngineRelevant(ObjectNode node, String key, Object value) {
        if (!isEngineRelevantKey(key)) {
            return;
        }
        String[] parts = key.substring("aiEngine.".length()).split("\\.");
        if (parts.length < 2) {
            // "aiEngine.models." and friends: no leaf to set, and writing at parts[0] would
            // replace the whole section object with a scalar.
            return;
        }
        ObjectNode parent = node;
        for (int i = 0; i < parts.length - 1; i++) {
            JsonNode child = parent.get(parts[i]);
            parent = (child instanceof ObjectNode on) ? on : parent.putObject(parts[i]);
        }
        parent.set(parts[parts.length - 1], objectMapper.valueToTree(value));
    }

    private void pushWithRetries(AiEngine cfg) {
        ObjectNode node = buildConfigNode(cfg);
        keepEnvForUnconfiguredIdentity(node, Set.of());
        String body = node.toString();
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                aiEngineClient.post("/api/v1/config", body, null);
                log.info("Pushed AI engine configuration on startup (attempt {})", attempt);
                return;
            } catch (Exception e) {
                log.warn(
                        "AI engine config push failed (attempt {}/{}): {}",
                        attempt,
                        MAX_ATTEMPTS,
                        e.getMessage());
                if (attempt < MAX_ATTEMPTS) {
                    try {
                        Thread.sleep(RETRY_DELAY_MS);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
        }
        log.warn(
                "Giving up pushing AI engine configuration after {} attempts; the engine will use"
                        + " its own environment configuration until the next restart.",
                MAX_ATTEMPTS);
    }

    private ObjectNode buildConfigNode(AiEngine cfg) {
        AiEngine.Models m = cfg.getModels();
        AiEngine.Rag r = cfg.getRag();
        AiEngine.Limits l = cfg.getLimits();

        ObjectNode root = objectMapper.createObjectNode();

        ObjectNode models = root.putObject("models");
        models.put("provider", m.getProvider());
        models.put("smartModel", m.getSmartModel());
        models.put("fastModel", m.getFastModel());
        models.put("smartMaxTokens", m.getSmartMaxTokens());
        models.put("fastMaxTokens", m.getFastMaxTokens());
        models.put("apiKey", m.getApiKey());
        models.put("baseUrl", m.getBaseUrl());

        ObjectNode rag = root.putObject("rag");
        rag.put("embeddingProvider", r.getEmbeddingProvider());
        rag.put("embeddingModel", r.getEmbeddingModel());
        rag.put("embeddingApiKey", r.getEmbeddingApiKey());
        rag.put("embeddingBaseUrl", r.getEmbeddingBaseUrl());
        rag.put("topK", r.getTopK());
        rag.put("maxSearches", r.getMaxSearches());

        ObjectNode limits = root.putObject("limits");
        limits.put("maxPages", l.getMaxPages());
        limits.put("maxCharacters", l.getMaxCharacters());
        limits.put("modelMaxConcurrency", l.getModelMaxConcurrency());

        return root;
    }

    // Bean defaults, used to detect whether the admin actually configured a section vs left it at
    // the built-in defaults, so an unconfigured section can be pushed as "keep the engine's env".
    private static final AiEngine.Models DEFAULT_MODELS = new AiEngine.Models();
    private static final AiEngine.Rag DEFAULT_RAG = new AiEngine.Rag();

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String text(JsonNode section, String field) {
        return section.path(field).asText("");
    }

    /**
     * Blank the provider/model/credential identity of any section the admin hasn't customised so
     * the push keeps the engine's environment-configured values for it. Empty identity fields mean
     * "keep env" on the engine side, so a fresh enable or a restart never silently switches an
     * env-configured engine's provider/model - which would otherwise break auth when the engine was
     * pointed at a different provider (e.g. Ollama/OpenAI) purely through its environment. Numeric
     * knobs (token limits, top_k, page/char caps) are left as-is: they equal the engine's own
     * defaults and don't affect provider auth.
     *
     * <p>{@code touchedKeys} are the {@code aiEngine.*} keys the admin just changed. A section
     * whose identity the admin explicitly edited is never blanked, even when the new value is
     * empty: clearing a leaked API key back to blank has to reach the engine as a real clear, not
     * be rewritten into "keep whatever you already have" (which would leave the revoked key live in
     * the engine's cache indefinitely). Empty on the startup push, where nothing was just edited.
     */
    private void keepEnvForUnconfiguredIdentity(ObjectNode root, Set<String> touchedKeys) {
        if (root.get("models") instanceof ObjectNode models) {
            boolean configured =
                    touchedIdentity(touchedKeys, MODEL_IDENTITY_KEYS)
                            || !isBlank(text(models, "apiKey"))
                            || !isBlank(text(models, "baseUrl"))
                            || !DEFAULT_MODELS.getProvider().equals(text(models, "provider"))
                            || !DEFAULT_MODELS.getSmartModel().equals(text(models, "smartModel"))
                            || !DEFAULT_MODELS.getFastModel().equals(text(models, "fastModel"));
            if (!configured) {
                models.put("provider", "");
                models.put("smartModel", "");
                models.put("fastModel", "");
                models.put("apiKey", "");
                models.put("baseUrl", "");
            }
        }
        if (root.get("rag") instanceof ObjectNode rag) {
            boolean configured =
                    touchedIdentity(touchedKeys, RAG_IDENTITY_KEYS)
                            || !isBlank(text(rag, "embeddingApiKey"))
                            || !isBlank(text(rag, "embeddingBaseUrl"))
                            || !DEFAULT_RAG
                                    .getEmbeddingProvider()
                                    .equals(text(rag, "embeddingProvider"))
                            || !DEFAULT_RAG.getEmbeddingModel().equals(text(rag, "embeddingModel"));
            if (!configured) {
                rag.put("embeddingProvider", "");
                rag.put("embeddingModel", "");
                rag.put("embeddingApiKey", "");
                rag.put("embeddingBaseUrl", "");
            }
        }
    }

    private static final Set<String> MODEL_IDENTITY_KEYS =
            Set.of(
                    "aiEngine.models.provider",
                    "aiEngine.models.smartModel",
                    "aiEngine.models.fastModel",
                    "aiEngine.models.apiKey",
                    "aiEngine.models.baseUrl");

    private static final Set<String> RAG_IDENTITY_KEYS =
            Set.of(
                    "aiEngine.rag.embeddingProvider",
                    "aiEngine.rag.embeddingModel",
                    "aiEngine.rag.embeddingApiKey",
                    "aiEngine.rag.embeddingBaseUrl");

    private static boolean touchedIdentity(Set<String> touchedKeys, Set<String> identityKeys) {
        return touchedKeys.stream().anyMatch(identityKeys::contains);
    }
}
