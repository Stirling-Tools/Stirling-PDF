package stirling.software.proprietary.model.chatbot;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotUsageSummary {

    private long allocatedTokens;
    private long consumedTokens;
    private long remainingTokens;
    private double usageRatio;
    private boolean nearingLimit;
    private boolean limitExceeded;
    private long lastIncrementTokens;
    private String window;
}
