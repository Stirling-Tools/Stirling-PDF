package stirling.software.SPDF.controller.api.pipeline;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(name = "DOCKER_ENABLE_SECURITY", havingValue = "false")
public class UserServiceNoOpImpl implements UserServiceInterface {
    // Implement the methods with no-op
    @Override
    public String getApiKeyForUser(String username) {
        // No-op implementation
        return "";
    }
}
