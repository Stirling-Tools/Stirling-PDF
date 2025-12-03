package stirling.software.proprietary.service.chatbot;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotSession;
import stirling.software.proprietary.model.chatbot.ChatbotSessionStatus;
import stirling.software.proprietary.model.chatbot.ChatbotSessionCreateRequest;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;
import stirling.software.proprietary.service.chatbot.exception.NoTextDetectedException;

@Service
@Slf4j
@RequiredArgsConstructor
public class ChatbotIngestionService {

    private final ChatbotCacheService cacheService;
    private final ChatbotSessionRegistry sessionRegistry;
    private final ChatbotFeatureProperties featureProperties;
    private final VectorStore vectorStore;
    private final ChatbotUsageService usageService;

    public ChatbotSession ingest(ChatbotSessionCreateRequest request) {
        ChatbotSettings settings = featureProperties.current();
        if (!settings.enabled()) {
            throw new ChatbotException("Chatbot feature is disabled");
        }
        if (!request.isWarningsAccepted() && settings.alphaWarning()) {
            throw new ChatbotException("Alpha warning must be accepted before use");
        }
        if (!StringUtils.hasText(request.getText())) {
            throw new NoTextDetectedException(
                    "No text detected in document payload. Images are currently unsupported – enable OCR to continue.");
        }

        long characterLimit = cacheService.getMaxDocumentCharacters();
        long textCharacters = request.getText().length();
        if (textCharacters > characterLimit) {
            throw new ChatbotException(
                    "Document text exceeds maximum allowed characters: " + characterLimit);
        }

        String sessionId =
                StringUtils.hasText(request.getSessionId())
                        ? request.getSessionId()
                        : ChatbotSession.randomSessionId();
        boolean imagesDetected = request.isImagesDetected();
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

        List<Document> documents =
                buildDocuments(
                        sessionId, request.getDocumentId(), request.getText(), metadata, settings);
        try {
            vectorStore.add(documents);
        } catch (RuntimeException ex) {
            throw new ChatbotException(
                    "Failed to index document content in vector store: "
                            + sanitizeRemoteMessage(ex.getMessage()),
                    ex);
        }

        String cacheKey =
                cacheService.register(
                        sessionId,
                        request.getDocumentId(),
                        immutableMetadata,
                        ocrApplied,
                        imagesDetected,
                        textCharacters);

        long estimatedTokens = Math.max(1L, Math.round(textCharacters / 4.0));

        ChatbotSession session =
                ChatbotSession.builder()
                        .sessionId(sessionId)
                        .documentId(request.getDocumentId())
                        .userId(request.getUserId())
                        .metadata(new ConcurrentHashMap<>(metadata))
                        .ocrRequested(ocrApplied)
                        .imageContentDetected(imagesDetected)
                        .textCharacters(textCharacters)
                        .estimatedTokens(estimatedTokens)
                        .warningsAccepted(request.isWarningsAccepted())
                        .alphaWarningRequired(settings.alphaWarning())
                        .cacheKey(cacheKey)
                        .createdAt(Instant.now())
                        .status(ChatbotSessionStatus.READY)
                        .build();
        session.setUsageSummary(
                usageService.registerIngestion(session.getUserId(), estimatedTokens));
        sessionRegistry.register(session);
        log.info(
                "Registered chatbot session {} for document {} with {} RAG chunks",
                sessionId,
                request.getDocumentId(),
                documents.size());
        return session;
    }

    private List<Document> buildDocuments(
            String sessionId,
            String documentId,
            String text,
            Map<String, String> metadata,
            ChatbotSettings settings) {
        List<Document> documents = new ArrayList<>();
        if (!StringUtils.hasText(text)) {
            return documents;
        }

        int chunkChars = Math.max(512, settings.rag().chunkSizeTokens() * 4);
        int overlapChars = Math.max(64, settings.rag().chunkOverlapTokens() * 4);

        int index = 0;
        int order = 0;
        while (index < text.length()) {
            int end = Math.min(text.length(), index + chunkChars);
            String chunk = text.substring(index, end).trim();
            if (!chunk.isEmpty()) {
                Document document = new Document(chunk);
                document.getMetadata().putAll(metadata);
                document.getMetadata().put("sessionId", sessionId);
                document.getMetadata().put("documentId", documentId);
                document.getMetadata().put("chunkOrder", Integer.toString(order));
                documents.add(document);
                order++;
            }
            if (end == text.length()) {
                break;
            }
            int nextIndex = end - overlapChars;
            if (nextIndex <= index) {
                nextIndex = end;
            }
            index = nextIndex;
        }

        if (documents.isEmpty()) {
            throw new ChatbotException("Unable to split document text into searchable chunks");
        }
        return documents;
    }

    private String sanitizeRemoteMessage(String message) {
        if (!StringUtils.hasText(message)) {
            return "unexpected provider error";
        }
        return message.replaceAll("(?i)api[-_ ]?key\\s*=[^\\s]+", "api-key=***");
    }
}
