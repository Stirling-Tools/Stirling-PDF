package stirling.software.proprietary.service.chatbot;

import java.time.Instant;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotChunkRequest;
import stirling.software.proprietary.model.chatbot.ChatbotSession;
import stirling.software.proprietary.model.chatbot.ChatbotSessionResponse;
import stirling.software.proprietary.model.chatbot.ChatbotSessionStatus;
import stirling.software.proprietary.model.chatbot.ChatbotUsageSummary;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatbotStreamingIngestionService {

    private static final int MAX_CHUNKS_PER_WINDOW = 25;
    private static final long RATE_WINDOW_MS = 2_000L;
    private static final long STALE_THRESHOLD_MS = Duration.ofMinutes(10).toMillis();
    private static final int MAX_SUMMARY_CHARS = 4_000;
    private static final int SNIPPET_CHARS = 320;

    private final ChatbotFeatureProperties featureProperties;
    private final ChatbotSessionRegistry sessionRegistry;
    private final ChatbotCacheService cacheService;
    private final VectorStore vectorStore;
    private final ChatbotUsageService usageService;
    private final ConcurrentHashMap<String, IngestionTracker> trackers =
            new ConcurrentHashMap<>();
    private final ChatbotUsageService usageService;

    public ChatbotSessionResponse ingestChunk(ChatbotChunkRequest request) {
        ChatbotSettings settings = featureProperties.current();
        if (!settings.streamingEnabled()) {
            throw new ChatbotException("Streaming ingestion is disabled in this environment.");
        }
        if (!StringUtils.hasText(request.getChunkText())) {
            throw new ChatbotException("Chunk payload must contain text.");
        }
        ChatbotSession session = resolveSession(request);
        processChunk(session, request);
        if (request.isFinalChunk()) {
            finalizeSession(session);
        }
        return buildResponse(session, settings);
    }

    private ChatbotSession resolveSession(ChatbotChunkRequest request) {
        if (StringUtils.hasText(request.getSessionId())) {
            return sessionRegistry
                    .findById(request.getSessionId())
                    .orElseThrow(() -> new ChatbotException("Unknown chatbot session"));
        }
        if (!StringUtils.hasText(request.getDocumentId())) {
            throw new ChatbotException("Document ID is required for the first chunk.");
        }
        String sessionId = UUID.randomUUID().toString();
        Map<String, String> metadata =
                request.getMetadata() == null
                        ? new ConcurrentHashMap<>()
                        : new ConcurrentHashMap<>(request.getMetadata());
        ChatbotSession session =
                ChatbotSession.builder()
                        .sessionId(sessionId)
                        .documentId(request.getDocumentId())
                        .userId(request.getUserId())
                        .metadata(metadata)
                        .ocrRequested(request.isOcrRequested())
                        .imageContentDetected(request.isImagesDetected())
                        .warningsAccepted(true)
                        .alphaWarningRequired(featureProperties.current().alphaWarning())
                        .textCharacters(0L)
                        .estimatedTokens(0L)
                        .createdAt(Instant.now())
                        .status(ChatbotSessionStatus.PROCESSING)
                        .build();
        sessionRegistry.register(session);
        return session;
    }

    private void processChunk(ChatbotSession session, ChatbotChunkRequest request) {
        ChatbotSessionStatus status = session.getStatus();
        if (status == ChatbotSessionStatus.READY && !request.isFinalChunk()) {
            throw new ChatbotException("Session already finalised, cannot accept more chunks.");
        }

        IngestionTracker tracker = trackerFor(session.getSessionId());
        tracker.record(request.getChunkText());

        Document chunkDocument = new Document(request.getChunkText());
        Map<String, Object> docMetadata = chunkDocument.getMetadata();
        docMetadata.putAll(session.getMetadata());
        docMetadata.put("sessionId", session.getSessionId());
        docMetadata.put("documentId", session.getDocumentId());
        docMetadata.put("chunkOrder", Integer.toString(request.getChunkOrder()));
        docMetadata.put("chunkSnippet", tracker.lastSnippet());

        try {
            vectorStore.add(List.of(chunkDocument));
        } catch (RuntimeException ex) {
            throw new ChatbotException(
                    "Failed to index streamed chunk: " + sanitize(ex.getMessage()), ex);
        }

        session.setTextCharacters(
                session.getTextCharacters() + request.getChunkText().length());
        session.setEstimatedTokens(Math.max(1L, Math.round(session.getTextCharacters() / 4.0)));

        if (request.getMetadata() != null && !request.getMetadata().isEmpty()) {
            session.getMetadata().putAll(request.getMetadata());
        }
        session.setImageContentDetected(
                session.isImageContentDetected() || request.isImagesDetected());
        session.setOcrRequested(session.isOcrRequested() || request.isOcrRequested());
        session.getMetadata().put("content.summary", tracker.summary());
    }

    private void finalizeSession(ChatbotSession session) {
        session.setStatus(ChatbotSessionStatus.READY);
        if (!StringUtils.hasText(session.getCacheKey())) {
            String cacheKey =
                    cacheService.register(
                            session.getSessionId(),
                            session.getDocumentId(),
                            new HashMap<>(session.getMetadata()),
                            session.isOcrRequested(),
                            session.isImageContentDetected(),
                            session.getTextCharacters());
            session.setCacheKey(cacheKey);
        }
        session.setUsageSummary(
                usageService.registerIngestion(
                        session.getUserId(), session.getEstimatedTokens()));
        trackers.remove(session.getSessionId());
    }

    private ChatbotSessionResponse buildResponse(
            ChatbotSession session, ChatbotSettings settings) {
        return ChatbotSessionResponse.builder()
                .sessionId(session.getSessionId())
                .documentId(session.getDocumentId())
                .alphaWarning(settings.alphaWarning())
                .ocrRequested(session.isOcrRequested())
                .imageContentDetected(session.isImageContentDetected())
                .textCharacters(session.getTextCharacters())
                .estimatedTokens(session.getEstimatedTokens())
                .createdAt(session.getCreatedAt())
                .maxCachedCharacters(cacheService.getMaxDocumentCharacters())
                .warnings(streamingWarnings(session))
                .metadata(new HashMap<>(session.getMetadata()))
                .usageSummary(session.getUsageSummary())
                .status(session.getStatus())
                .build();
    }

    private List<String> streamingWarnings(ChatbotSession session) {
        List<String> warnings = new ArrayList<>();
        if (session.isImageContentDetected()) {
            warnings.add("Image content detected – images are currently ignored.");
        }
        if (session.isOcrRequested()) {
            warnings.add("OCR was requested for this session.");
        }
        return warnings;
    }

    private String sanitize(String message) {
        if (!StringUtils.hasText(message)) {
            return "unexpected error";
        }
        return message.replaceAll("(?i)api[-_ ]?key\\s*=[^\\s]+", "api-key=***");
    }

    private IngestionTracker trackerFor(String sessionId) {
        return trackers.computeIfAbsent(sessionId, id -> new IngestionTracker());
    }

    @Scheduled(fixedDelayString = "${chatbot.streaming.cleanup-interval:300000}")
    public void cleanupStaleSessions() {
        if (!featureProperties.current().streamingEnabled()) {
            return;
        }
        long now = System.currentTimeMillis();
        trackers.forEach(
                (sessionId, tracker) -> {
                    if (now - tracker.lastUpdated() > STALE_THRESHOLD_MS) {
                        trackers.remove(sessionId);
                        sessionRegistry.remove(sessionId);
                        cacheService.invalidateSession(sessionId);
                        log.warn(
                                "Streaming session {} cleaned up after {} ms of inactivity",
                                sessionId,
                                now - tracker.lastUpdated());
                    }
                });
    }

    private final class IngestionTracker {

        private long windowStart = System.currentTimeMillis();
        private int chunksInWindow = 0;
        private long lastUpdated = System.currentTimeMillis();
        private final StringBuilder summaryBuilder = new StringBuilder();
        private String lastSnippet = "";

        synchronized void record(String chunkText) {
            long now = System.currentTimeMillis();
            lastUpdated = now;
            if (now - windowStart > RATE_WINDOW_MS) {
                windowStart = now;
                chunksInWindow = 0;
            }
            if (chunksInWindow >= MAX_CHUNKS_PER_WINDOW) {
                throw new ChatbotException(
                        "Too many chunk uploads in a short period. Please slow down.");
            }
            chunksInWindow++;
            lastSnippet = snippet(chunkText);
            appendSummary(lastSnippet);
        }

        private void appendSummary(String snippet) {
            if (!StringUtils.hasText(snippet)) {
                return;
            }
            if (summaryBuilder.length() >= MAX_SUMMARY_CHARS) {
                return;
            }
            summaryBuilder.append(snippet);
            if (summaryBuilder.length() > MAX_SUMMARY_CHARS) {
                summaryBuilder.setLength(MAX_SUMMARY_CHARS);
            }
        }

        String summary() {
            return summaryBuilder.toString();
        }

        long lastUpdated() {
            return lastUpdated;
        }

        String lastSnippet() {
            return lastSnippet;
        }

        private String snippet(String text) {
            if (!StringUtils.hasText(text)) {
                return "";
            }
            String normalized = text.replaceAll("\\s+", " ").trim();
            if (normalized.length() > SNIPPET_CHARS) {
                return normalized.substring(0, SNIPPET_CHARS - 3) + "...";
            }
            return normalized;
        }
    }
}
