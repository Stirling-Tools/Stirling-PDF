package stirling.software.proprietary.service.chatbot;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import stirling.software.proprietary.model.chatbot.ChatbotSession;

@Component
public class ChatbotSessionRegistry {

    private final Map<String, ChatbotSession> sessionStore = new ConcurrentHashMap<>();

    public void register(ChatbotSession session) {
        sessionStore.put(session.getSessionId(), session);
    }

    public Optional<ChatbotSession> findById(String sessionId) {
        return Optional.ofNullable(sessionStore.get(sessionId));
    }

    public void remove(String sessionId) {
        sessionStore.remove(sessionId);
    }
}
