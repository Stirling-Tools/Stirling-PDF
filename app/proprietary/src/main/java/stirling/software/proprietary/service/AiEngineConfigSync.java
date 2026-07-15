package stirling.software.proprietary.service;

import java.util.Map;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

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
 * key/baseUrl/model fields mean "keep the engine's own environment credential", so
 * environment-driven deployments (where the engine sets {@code STIRLING_ALLOW_CONFIG_PUSH=false}
 * and rejects the push) stay fully env-controlled. Best-effort and non-blocking: a slow or
 * unreachable engine never delays or fails Stirling startup.
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

    @EventListener(ApplicationReadyEvent.class)
    public void pushConfigOnStartup() {
        AiEngine cfg = applicationProperties.getAiEngine();
        if (!cfg.isEnabled()) {
            return;
        }
        // Engine may still be booting; push on a virtual thread with a few retries so we never
        // block or crash Stirling startup when the engine is slow or briefly unreachable.
        Thread.ofVirtual().name("ai-engine-config-sync").start(() -> pushWithRetries(cfg));
    }

    /**
     * Push AI settings to the engine immediately after an admin save so model/RAG/limit changes
     * reach the engine without waiting for a processor restart. {@code pendingAiEngine} are the
     * pending {@code aiEngine.*} dot-notation changes; the running bean overlaid with these is the
     * current settings.yml state. No-op unless AI is enabled and an engine-relevant key changed.
     */
    public void pushLiveAfterSave(Map<String, Object> pendingAiEngine) {
        // Gate on the RUNNING bean: AiEngineClient refuses calls while the bean is disabled, so
        // pushing on a pending-but-not-restarted enable would always fail. The post-restart
        // startup push covers first-time enablement.
        if (pendingAiEngine == null
                || pendingAiEngine.isEmpty()
                || !applicationProperties.getAiEngine().isEnabled()) {
            return;
        }
        boolean engineRelevant =
                pendingAiEngine.keySet().stream().anyMatch(AiEngineConfigSync::isEngineRelevantKey);
        if (!engineRelevant) {
            return;
        }
        ObjectNode node = buildConfigNode(applicationProperties.getAiEngine());
        pendingAiEngine.forEach((k, v) -> overlayIfEngineRelevant(node, k, v));
        String body = node.toString();
        Thread.ofVirtual().name("ai-engine-config-live-push").start(() -> pushOnce(body));
    }

    private void pushOnce(String body) {
        try {
            aiEngineClient.post("/api/v1/config", body, null);
            log.info("Pushed AI engine configuration after settings change");
        } catch (Exception e) {
            log.warn(
                    "Live AI engine config push failed: {} (will re-sync on next restart)",
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
        ObjectNode parent = node;
        for (int i = 0; i < parts.length - 1; i++) {
            JsonNode child = parent.get(parts[i]);
            parent = (child instanceof ObjectNode on) ? on : parent.putObject(parts[i]);
        }
        parent.set(parts[parts.length - 1], objectMapper.valueToTree(value));
    }

    private void pushWithRetries(AiEngine cfg) {
        String body = buildConfigNode(cfg).toString();
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
}
