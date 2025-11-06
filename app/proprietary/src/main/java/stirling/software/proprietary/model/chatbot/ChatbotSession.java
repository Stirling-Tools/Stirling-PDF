package stirling.software.proprietary.model.chatbot;

import java.time.Instant;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChatbotSession {

    private String sessionId;
    private String documentId;
    private String userId;
    private Map<String, String> metadata;
    private boolean ocrRequested;
    private boolean warningsAccepted;
    private boolean alphaWarningRequired;
    private boolean imageContentDetected;
    private long textCharacters;
    private String cacheKey;
    private String vectorStoreId;
    private Instant createdAt;

    public static String randomSessionId() {
        return UUID.randomUUID().toString();
    }

    public Map<String, String> getMetadata() {
        return metadata == null ? Collections.emptyMap() : metadata;
    }
}
