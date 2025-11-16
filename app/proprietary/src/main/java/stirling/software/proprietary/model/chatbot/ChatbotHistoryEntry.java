package stirling.software.proprietary.model.chatbot;

import java.time.Instant;

/** Simple record representing a stored chatbot conversation turn. */
public record ChatbotHistoryEntry(
        String role, String content, String documentId, String documentName, Instant timestamp) {}
