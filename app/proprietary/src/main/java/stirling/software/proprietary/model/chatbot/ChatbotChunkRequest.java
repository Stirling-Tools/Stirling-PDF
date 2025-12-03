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
public class ChatbotChunkRequest {

    private String sessionId;
    private String documentId;
    private String userId;
    private String chunkText;
    private int chunkOrder;
    private Map<String, String> metadata;
    private boolean finalChunk;
    private boolean ocrRequested;
    private boolean imagesDetected;
    private long totalCharactersHint;
}
