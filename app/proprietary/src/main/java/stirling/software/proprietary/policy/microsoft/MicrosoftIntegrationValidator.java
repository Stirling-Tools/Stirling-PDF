package stirling.software.proprietary.policy.microsoft;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

/**
 * The MICROSOFT_365 connection schema, enforced on save. Whether the app registration can actually
 * reach the library is checked later, when a source or destination using it is saved, since that is
 * the first point a folder is known.
 */
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
