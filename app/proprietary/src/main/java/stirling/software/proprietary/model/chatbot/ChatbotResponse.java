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
public class ChatbotResponse {

    private String sessionId;
    private String modelUsed;
    private double confidence;
    private String answer;
    private boolean escalated;
    private boolean servedFromNanoOnly;
    private boolean cacheHit;
    private Instant respondedAt;
    private List<String> warnings;
    private Map<String, Object> metadata;

    public List<String> getWarnings() {
        return warnings == null ? Collections.emptyList() : warnings;
    }

    public Map<String, Object> getMetadata() {
        return metadata == null ? Collections.emptyMap() : metadata;
    }
}
