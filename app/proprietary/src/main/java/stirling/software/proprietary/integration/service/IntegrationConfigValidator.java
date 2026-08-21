package stirling.software.proprietary.integration.service;

import java.util.Map;

import stirling.software.proprietary.integration.model.IntegrationType;

/**
 * Validates one integration type's config map at save time. Implementations are beans discovered by
 * {@link IntegrationConfigService}, so the feature that understands a type (e.g. the policy S3
 * backend) owns its schema without the integration module depending on it. Types with no registered
 * validator save free-form.
 */
public interface IntegrationConfigValidator {

    /** The type this validator understands. */
    IntegrationType type();

    /**
     * Validates the config as it will be stored (secrets already sanitized/merged, so values are
     * real, never the redaction mask). Throws {@link IllegalArgumentException} on bad config.
     */
    void validate(Map<String, Object> config);
}
