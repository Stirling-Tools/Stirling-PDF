package stirling.software.proprietary.policy.s3;

import java.net.URI;
import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.cluster.s3.S3Clients;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

/**
 * The S3 connection schema, enforced when an S3 {@link IntegrationType} config is saved: bucket and
 * credentials required, endpoint an http(s) URL that must not reach private addresses without the
 * operator opt-in - the same rules {@link S3ConnectionPool} enforces before signing, moved to save
 * time so a bad connection fails in the form rather than in a sweep.
 */
@Component
@RequiredArgsConstructor
public class S3IntegrationValidator implements IntegrationConfigValidator {

    private final ApplicationProperties applicationProperties;

    @Override
    public IntegrationType type() {
        return IntegrationType.S3;
    }

    @Override
    public void validate(Map<String, Object> config) {
        S3Config parsed = S3Config.from(config);
        if (parsed.endpoint() == null) {
            return;
        }
        try {
            S3Clients.validateEndpointHost(
                    URI.create(parsed.endpoint()),
                    applicationProperties.getPolicies().isAllowPrivateS3Endpoints(),
                    "S3 connection endpoint",
                    "set policies.allowPrivateS3Endpoints=true to opt in (e.g. for a local"
                            + " MinIO).");
        } catch (IllegalStateException e) {
            throw new IllegalArgumentException(e.getMessage(), e);
        }
    }
}
