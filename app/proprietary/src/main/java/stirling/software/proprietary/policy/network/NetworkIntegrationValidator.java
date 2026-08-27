package stirling.software.proprietary.policy.network;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.ConditionalOnProcessor;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

/**
 * The network connection schema, enforced when a NETWORK {@link IntegrationType} config is saved:
 * protocol, host, credentials (and, for SMB, a share) required, with the same private-address guard
 * {@link RemoteFileClientFactory} applies before connecting, moved to save time so a bad connection
 * fails in the form rather than in a sweep. A live connectivity check runs later, when the source
 * that uses the connection is saved ({@link NetworkInputSource#validate}).
 */
@Component
@ConditionalOnProcessor
@RequiredArgsConstructor
public class NetworkIntegrationValidator implements IntegrationConfigValidator {

    private final NetworkHostGuard hostGuard;

    @Override
    public IntegrationType type() {
        return IntegrationType.NETWORK;
    }

    @Override
    public void validate(Map<String, Object> config) {
        NetworkConfig parsed = NetworkConfig.from(config);
        hostGuard.requirePermitted(parsed.host());
    }
}
