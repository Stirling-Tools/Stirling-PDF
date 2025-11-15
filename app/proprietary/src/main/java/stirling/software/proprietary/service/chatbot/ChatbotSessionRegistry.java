package stirling.software.proprietary.service.chatbot;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import stirling.software.proprietary.model.chatbot.ChatbotSession;

@Component
public class ChatbotSessionRegistry {

    private final Map<String, ChatbotSession> sessionStore = new ConcurrentHashMap<>();
    private final Map<String, String> documentToSession = new ConcurrentHashMap<>();

    public void register(ChatbotSession session) {
        sessionStore.put(session.getSessionId(), session);
        if (session.getDocumentId() != null) {
            documentToSession.put(session.getDocumentId(), session.getSessionId());
        }
    }

    public Optional<ChatbotSession> findById(String sessionId) {
        return Optional.ofNullable(sessionStore.get(sessionId));
    }

    public void remove(String sessionId) {
        Optional.ofNullable(sessionStore.remove(sessionId))
                .map(ChatbotSession::getDocumentId)
                .ifPresent(documentToSession::remove);
    }

    public Optional<ChatbotSession> findByDocumentId(String documentId) {
        return Optional.ofNullable(documentToSession.get(documentId)).flatMap(this::findById);
    }

    public void removeByDocumentId(String documentId) {
        Optional.ofNullable(documentToSession.remove(documentId)).ifPresent(sessionStore::remove);
    }
}
