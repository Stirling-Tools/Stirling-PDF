package stirling.software.proprietary.service.chatbot;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatbotRetrievalService {

    private final ChatbotCacheService cacheService;
    private final VectorStore vectorStore;
    private final Cache<String, List<Document>> retrievalCache =
            Caffeine.newBuilder().maximumSize(200).expireAfterWrite(30, TimeUnit.SECONDS).build();

    public List<Document> retrieveTopK(String sessionId, String query, ChatbotSettings settings) {
        cacheService
                .resolveBySessionId(sessionId)
                .orElseThrow(() -> new ChatbotException("Unknown chatbot session"));

        int topK = Math.max(settings.rag().topK(), 1);
        String sanitizedQuery = StringUtils.hasText(query) ? query : "";
        String filterExpression = "metadata.sessionId == '" + escape(sessionId) + "'";
        String cacheKey = cacheKey(sessionId, sanitizedQuery, topK);
        List<Document> cached = retrievalCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }

        SearchRequest searchRequest =
                SearchRequest.builder()
                        .query(sanitizedQuery)
                        .topK(topK)
                        .filterExpression(filterExpression)
                        .similarityThreshold(0.7f)
                        .build();
        List<Document> results;

        try {
            results = vectorStore.similaritySearch(searchRequest);
        } catch (RuntimeException ex) {
            throw new ChatbotException(
                    "Failed to perform vector similarity search: "
                            + sanitizeRemoteMessage(ex.getMessage()),
                    ex);
        }
        results =
                results.stream()
                        .filter(
                                doc ->
                                        sessionId.equals(
                                                doc.getMetadata().getOrDefault("sessionId", "")))
                        .limit(topK)
                        .toList();
        if (results.isEmpty()) {
            log.warn("No context available for chatbot session {}", sessionId);
        }

        List<Document> immutableResults = List.copyOf(results);
        retrievalCache.put(cacheKey, immutableResults);
        return immutableResults;
    }

    private String sanitizeRemoteMessage(String message) {
        if (!StringUtils.hasText(message)) {
            return "unexpected provider error";
        }
        return message.replaceAll("(?i)api[-_ ]?key\\s*=[^\\s]+", "api-key=***");
    }

    private String escape(String value) {
        return value.replace("'", "\\'");
    }

    private String cacheKey(String sessionId, String query, int topK) {
        return sessionId + "::" + Objects.hash(query, topK);
    }
}
