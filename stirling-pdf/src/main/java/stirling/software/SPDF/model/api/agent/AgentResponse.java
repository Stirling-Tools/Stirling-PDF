package stirling.software.SPDF.model.api.agent;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class AgentResponse {
    private String message;
    private Object data;
    private boolean success;
}
