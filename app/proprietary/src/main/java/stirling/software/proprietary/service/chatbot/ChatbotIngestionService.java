package stirling.software.proprietary.service.chatbot;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.embedding.EmbeddingResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotSession;
import stirling.software.proprietary.model.chatbot.ChatbotSessionCreateRequest;
import stirling.software.proprietary.model.chatbot.ChatbotTextChunk;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;
import stirling.software.proprietary.service.chatbot.exception.NoTextDetectedException;

@Service
@ConditionalOnProperty(value = "premium.proFeatures.chatbot.enabled", havingValue = "true")
@ConditionalOnBean(EmbeddingModel.class)
@Slf4j
@RequiredArgsConstructor
public class ChatbotIngestionService {

    private final ChatbotCacheService cacheService;
    private final ChatbotSessionRegistry sessionRegistry;
    private final ChatbotFeatureProperties featureProperties;
    private final EmbeddingModel embeddingModel;

    public ChatbotSession ingest(ChatbotSessionCreateRequest request) {
        ChatbotSettings settings = featureProperties.current();
        if (!settings.enabled()) {
            throw new ChatbotException("Chatbot feature is disabled");
        }
        if (!request.isWarningsAccepted() && settings.alphaWarning()) {
            throw new ChatbotException("Alpha warning must be accepted before use");
        }
        boolean hasText = StringUtils.hasText(request.getText());
        if (!hasText) {
            throw new NoTextDetectedException(
                    "No text detected in document payload. Images are currently unsupported – enable OCR to continue.");
        }

        String sessionId =
                StringUtils.hasText(request.getSessionId())
                        ? request.getSessionId()
                        : ChatbotSession.randomSessionId();
        boolean imagesDetected = request.isImagesDetected();
        long textCharacters = request.getText().length();
        boolean ocrApplied = request.isOcrRequested();
        Map<String, String> metadata = new HashMap<>();
        if (request.getMetadata() != null) {
            metadata.putAll(request.getMetadata());
        }
        metadata.put("content.imagesDetected", Boolean.toString(imagesDetected));
        metadata.put("content.characterCount", String.valueOf(textCharacters));
        metadata.put(
                "content.extractionSource", ocrApplied ? "ocr-text-layer" : "embedded-text-layer");
        Map<String, String> immutableMetadata = Map.copyOf(metadata);

        String cacheKey =
                cacheService.register(
                        sessionId,
                        request.getDocumentId(),
                        request.getText(),
                        immutableMetadata,
                        ocrApplied,
                        imagesDetected,
                        textCharacters);

        List<String> chunkTexts =
                chunkText(
                        request.getText(),
                        settings.rag().chunkSizeTokens(),
                        settings.rag().chunkOverlapTokens());
        List<ChatbotTextChunk> chunks = embedChunks(sessionId, cacheKey, chunkTexts, metadata);
        cacheService.attachChunks(cacheKey, chunks);

        ChatbotSession session =
                ChatbotSession.builder()
                        .sessionId(sessionId)
                        .documentId(request.getDocumentId())
                        .userId(request.getUserId())
                        .metadata(immutableMetadata)
                        .ocrRequested(ocrApplied)
                        .imageContentDetected(imagesDetected)
                        .textCharacters(textCharacters)
                        .warningsAccepted(request.isWarningsAccepted())
                        .alphaWarningRequired(settings.alphaWarning())
                        .cacheKey(cacheKey)
                        .createdAt(Instant.now())
                        .build();
        sessionRegistry.register(session);
        log.info(
                "Registered chatbot session {} for document {} with {} chunks",
                sessionId,
                request.getDocumentId(),
                chunks.size());
        return session;
    }

    private List<String> chunkText(String text, int chunkSizeTokens, int overlapTokens) {
        String[] tokens = text.split("\\s+");
        List<String> chunks = new ArrayList<>();
        if (tokens.length == 0) {
            return chunks;
        }
        int effectiveChunk = Math.max(chunkSizeTokens, 1);
        int effectiveOverlap = Math.max(Math.min(overlapTokens, effectiveChunk - 1), 0);
        int index = 0;
        while (index < tokens.length) {
            int end = Math.min(tokens.length, index + effectiveChunk);
            String chunk = String.join(" ", java.util.Arrays.copyOfRange(tokens, index, end));
            if (StringUtils.hasText(chunk)) {
                chunks.add(chunk);
            }
            if (end == tokens.length) {
                break;
            }
            index = end - effectiveOverlap;
            if (index <= 0) {
                index = end;
            }
        }
        return chunks;
    }

    private List<ChatbotTextChunk> embedChunks(
            String sessionId,
            String cacheKey,
            List<String> chunkTexts,
            Map<String, String> metadata) {
        if (chunkTexts.isEmpty()) {
            throw new ChatbotException("Unable to split document text into retrievable chunks");
        }
        EmbeddingResponse response = embeddingModel.embedForResponse(chunkTexts);
        if (response.getResults().size() != chunkTexts.size()) {
            throw new ChatbotException("Mismatch between chunks and embedding results");
        }
        List<ChatbotTextChunk> chunks = new ArrayList<>();
        for (int i = 0; i < chunkTexts.size(); i++) {
            String chunkId = sessionId + ":" + i + ":" + UUID.randomUUID();
            float[] embeddingArray = response.getResults().get(i).getOutput();
            List<Double> embedding = new ArrayList<>(embeddingArray.length);
            for (float value : embeddingArray) {
                embedding.add((double) value);
            }
            chunks.add(
                    ChatbotTextChunk.builder()
                            .id(chunkId)
                            .order(i)
                            .text(chunkTexts.get(i))
                            .embedding(embedding)
                            .build());
        }
        log.debug(
                "Computed embeddings for session {} cacheKey {} ({} vectors)",
                sessionId,
                cacheKey,
                chunks.size());
        return chunks;
    }
}
