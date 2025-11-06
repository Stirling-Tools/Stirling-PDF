package stirling.software.proprietary.model.chatbot;

import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotSessionCreateRequest {

    private String sessionId;
    private String documentId;
    private String userId;
    private String text;
    private Map<String, String> metadata;
    private boolean ocrRequested;
    private boolean warningsAccepted;
    private boolean imagesDetected;
}
