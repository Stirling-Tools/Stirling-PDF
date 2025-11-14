package stirling.software.proprietary.service.chatbot;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotSession;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatbotMemoryService {

    private final VectorStore vectorStore;

    public void recordTurn(ChatbotSession session, String prompt, String answer) {
        if (session == null) {
            return;
        }
        if (!StringUtils.hasText(prompt) && !StringUtils.hasText(answer)) {
            return;
        }
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("sessionId", session.getSessionId());
        metadata.put("documentId", session.getDocumentId());
        metadata.put("turnType", "conversation");
        metadata.put("turnTimestamp", Instant.now().toString());
        metadata.put("userId", session.getUserId());

        StringBuilder contentBuilder = new StringBuilder();
        if (StringUtils.hasText(prompt)) {
            contentBuilder.append("User: ").append(prompt.trim()).append("\n");
        }
        if (StringUtils.hasText(answer)) {
            contentBuilder.append("Assistant: ").append(answer.trim());
        }
        try {
            vectorStore.add(List.of(new Document(contentBuilder.toString(), metadata)));
        } catch (RuntimeException ex) {
            log.warn("Failed to persist chatbot conversation turn: {}", ex.getMessage());
        }
    }
}
