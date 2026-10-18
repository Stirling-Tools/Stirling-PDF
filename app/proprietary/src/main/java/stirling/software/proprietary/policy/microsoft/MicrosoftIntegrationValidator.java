package stirling.software.proprietary.policy.microsoft;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

@Component
@RequiredArgsConstructor
public class MicrosoftIntegrationValidator implements IntegrationConfigValidator {

    private final MicrosoftConnectionResolver resolver;

    @Override
    public IntegrationType type() {
        return IntegrationType.MICROSOFT_365;
    }

    @Override
    public void validate(Map<String, Object> config) {
        MicrosoftDriveConfig.fromConnection(config, resolver.appDefaults());
    }
}
