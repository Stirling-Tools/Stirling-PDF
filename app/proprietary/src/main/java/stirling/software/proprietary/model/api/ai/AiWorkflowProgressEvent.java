package stirling.software.proprietary.model.api.ai;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AiWorkflowProgressEvent {
    private String phase;
    private String message;
    private int turn;
    private long timestamp;

    public static AiWorkflowProgressEvent of(String phase, String message, int turn) {
        return new AiWorkflowProgressEvent(phase, message, turn, System.currentTimeMillis());
    }
}
