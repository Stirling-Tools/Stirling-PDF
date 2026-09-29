package stirling.software.proprietary.integration.purview;

import java.util.Map;

import org.springframework.stereotype.Component;

import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

/** The Purview connection schema, enforced when the config is saved. */
@Component
public class PurviewIntegrationValidator implements IntegrationConfigValidator {

    @Override
    public IntegrationType type() {
        return IntegrationType.PURVIEW;
    }

    @Override
    public void validate(Map<String, Object> config) {
        PurviewConnectionSettings.from(config);
    }
}
