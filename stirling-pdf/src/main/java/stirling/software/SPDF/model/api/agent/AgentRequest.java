package stirling.software.SPDF.model.api.agent;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
public class AgentRequest {
    private String userPrompt;
    // Files will be handled as a separate @RequestPart in the controller
    // and passed as a List<MultipartFile> to the service.
    // This DTO therefore doesn't need to carry file information directly.
    private Map<String, Object> additionalParams;
}
