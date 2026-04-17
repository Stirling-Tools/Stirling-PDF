package stirling.software.proprietary.model.api.ai;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AiWorkflowProgressEvent {
    private AiWorkflowPhase phase;
    private long timestamp;

    public static AiWorkflowProgressEvent of(AiWorkflowPhase phase) {
        return new AiWorkflowProgressEvent(phase, System.currentTimeMillis());
    }
}
