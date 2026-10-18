package stirling.software.proprietary.policy.google;

import java.util.Map;

import org.springframework.stereotype.Component;

import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

@Component
public class GoogleIntegrationValidator implements IntegrationConfigValidator {

    @Override
    public IntegrationType type() {
        return IntegrationType.GOOGLE_WORKSPACE;
    }

    @Override
    public void validate(Map<String, Object> config) {
        GoogleDriveConfig.serviceAccount(config);
    }
}
