package stirling.software.proprietary.model.chatbot;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotTextChunk {

    private String id;
    private String text;
    private int order;
    private List<Double> embedding;
}
