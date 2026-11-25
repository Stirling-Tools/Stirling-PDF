package stirling.software.proprietary.policy.microsoft;

import java.util.Map;

import org.springframework.stereotype.Component;

import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

@Component
public class MicrosoftIntegrationValidator implements IntegrationConfigValidator {

    @Override
    public IntegrationType type() {
        return IntegrationType.MICROSOFT_365;
    }

    @Override
    public void validate(Map<String, Object> config) {
        MicrosoftDriveConfig.fromConnection(config);
    }
}
