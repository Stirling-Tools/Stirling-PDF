package stirling.software.proprietary.model.chatbot;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotQueryRequest {

    private String sessionId;
    private String prompt;
    private boolean allowEscalation;
}
