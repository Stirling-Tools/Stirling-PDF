package stirling.software.proprietary.service.chatbot;

import java.util.List;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

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

    public List<Document> retrieveTopK(String sessionId, String query, ChatbotSettings settings) {
        cacheService
                .resolveBySessionId(sessionId)
                .orElseThrow(() -> new ChatbotException("Unknown chatbot session"));

        int topK = Math.max(settings.rag().topK(), 1);
        String sanitizedQuery = StringUtils.hasText(query) ? query : "";
        String filterExpression = "sessionId == '" + escape(sessionId) + "'";
        SearchRequest searchRequest =
                SearchRequest.builder()
                        .query(sanitizedQuery)
                        .topK(topK)
                        .filterExpression(filterExpression)
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
            throw new ChatbotException("No context available for this chatbot session");
        }
        return results;
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
}
