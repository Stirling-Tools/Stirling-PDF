package stirling.software.proprietary.model.chatbot;

import java.time.Instant;
import java.util.Collections;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotDocumentCacheEntry {

    private String cacheKey;
    private String sessionId;
    private String documentId;
    private Map<String, String> metadata;
    private boolean ocrApplied;
    private boolean imageContentDetected;
    private long textCharacters;
    private Instant storedAt;

    public Map<String, String> getMetadata() {
        return metadata == null ? Collections.emptyMap() : metadata;
    }
}
