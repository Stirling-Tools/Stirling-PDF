package stirling.software.proprietary.service.chatbot;

import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotQueryRequest;
import stirling.software.proprietary.model.chatbot.ChatbotResponse;
import stirling.software.proprietary.model.chatbot.ChatbotSession;
import stirling.software.proprietary.model.chatbot.ChatbotSessionCreateRequest;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.service.chatbot.exception.ChatbotException;

@Service
@ConditionalOnProperty(value = "premium.proFeatures.chatbot.enabled", havingValue = "true")
@ConditionalOnBean({ChatbotIngestionService.class, ChatbotConversationService.class})
@Slf4j
@RequiredArgsConstructor
public class ChatbotService {

    private final ChatbotIngestionService ingestionService;
    private final ChatbotConversationService conversationService;
    private final ChatbotSessionRegistry sessionRegistry;
    private final ChatbotCacheService cacheService;
    private final ChatbotFeatureProperties featureProperties;
    private final AuditService auditService;

    public ChatbotSession createSession(ChatbotSessionCreateRequest request) {
        ChatbotSession session = ingestionService.ingest(request);
        log.debug("Chatbot session {} initialised", session.getSessionId());
        audit(
                "CHATBOT_SESSION_CREATED",
                session.getSessionId(),
                Map.of(
                        "documentId", session.getDocumentId(),
                        "ocrRequested", session.isOcrRequested()));
        return session;
    }

    public ChatbotResponse ask(ChatbotQueryRequest request) {
        ChatbotResponse response = conversationService.handleQuery(request);
        audit(
                "CHATBOT_QUERY",
                request.getSessionId(),
                Map.of(
                        "modelUsed", response.getModelUsed(),
                        "escalated", response.isEscalated(),
                        "confidence", response.getConfidence()));
        return response;
    }

    public void close(String sessionId) {
        sessionRegistry
                .findById(sessionId)
                .orElseThrow(() -> new ChatbotException("Session not found for closure"));
        sessionRegistry.remove(sessionId);
        cacheService.invalidateSession(sessionId);
        audit("CHATBOT_SESSION_CLOSED", sessionId, Map.of());
        log.debug("Chatbot session {} closed", sessionId);
    }

    private void audit(String action, String sessionId, Map<String, Object> data) {
        if (!featureProperties.current().audit().enabled()) {
            return;
        }
        Map<String, Object> payload = new HashMap<>(data == null ? Map.of() : data);
        payload.put("sessionId", sessionId);
        auditService.audit(stirling.software.proprietary.audit.AuditEventType.PDF_PROCESS, payload);
    }
}
