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
 * Pushes admin-configured AI settings to the engine on startup and after each save; non-blocking
 * and best-effort. Disabled via {@code aiEngine.pushConfigToEngine} for env-driven deployments.
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

    // Single worker keeps pushes strictly ordered; virtual (daemon) thread never blocks shutdown.
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
        // Engine may still be booting; push off-thread with retries so startup never blocks.
        submit(() -> pushWithRetries(cfg));
    }

    /**
     * Push AI settings to the engine after an admin save so changes apply without a restart. No-op
     * unless AI is enabled and an engine-relevant {@code aiEngine.*} key changed.
     */
    public void pushLiveAfterSave(Map<String, Object> pendingAiEngine) {
        // Save already persisted; a build/dispatch failure must not fail the save.
        try {
            // Gate on the running bean: the client refuses calls while disabled, so a pending
            // enable would always fail here; the post-restart startup push covers first enablement.
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
     * Run pushes on the single-threaded executor so they stay serialised: each carries the full
     * config and the engine keeps whatever lands last, so overlapping pushes could leave it stale.
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

    // Only models/rag/limits reach the engine; the rest is processor-side.
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
            // No leaf here; writing at parts[0] would overwrite the whole section with a scalar.
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

    // Defaults used to detect whether a section was configured or left at built-in values.
    private static final AiEngine.Models DEFAULT_MODELS = new AiEngine.Models();
    private static final AiEngine.Rag DEFAULT_RAG = new AiEngine.Rag();

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String text(JsonNode section, String field) {
        return section.path(field).asText("");
    }

    /**
     * Blank the identity (provider/model/credentials) of unconfigured sections so the push keeps
     * the engine's env values; edited sections are sent as-is so a cleared key really clears.
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
