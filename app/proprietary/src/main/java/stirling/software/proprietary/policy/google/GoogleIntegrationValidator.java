package stirling.software.proprietary.policy.google;

import java.util.Map;

import org.springframework.stereotype.Component;

import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

/**
 * The GOOGLE_WORKSPACE connection schema: a service account JSON key and an optional user to act
 * as. Whether the account can reach a folder is checked when a location using it is saved.
 */
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
