package stirling.software.proprietary.integration.api;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

@Component
@RequiredArgsConstructor
public class VectorDbIntegrationValidator implements IntegrationConfigValidator {
    private final ApplicationProperties applicationProperties;

    @Override
    public IntegrationType type() {
        return IntegrationType.VECTOR_DB;
    }

    @Override
    public void validate(Map<String, Object> config) {
        validate(VectorDbConnectionSettings.from(config));
    }

    public void validate(VectorDbConnectionSettings settings) {
        ApiIntegrationValidator.requirePublicHost(
                settings.api(), applicationProperties, "Vector database URL");
    }
}
