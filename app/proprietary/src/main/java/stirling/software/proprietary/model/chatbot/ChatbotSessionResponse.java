package stirling.software.proprietary.model.chatbot;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotSessionResponse {

    private String sessionId;
    private String documentId;
    private boolean alphaWarning;
    private boolean ocrRequested;
    private long maxCachedCharacters;
    private Instant createdAt;
    private List<String> warnings;
    private Map<String, String> metadata;

    public List<String> getWarnings() {
        return warnings == null ? Collections.emptyList() : warnings;
    }

    public Map<String, String> getMetadata() {
        return metadata == null ? Collections.emptyMap() : metadata;
    }
}
