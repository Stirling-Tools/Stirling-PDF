package stirling.software.proprietary.integration.api;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.policy.engine.PipelineStepValidator;
import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * Authorization-checks the {@code connectionId} of any integration step, on the request thread.
 *
 * <p>This is what stops an integration step being a confused deputy. A step names a connection by
 * id, and the worker thread that runs it has no principal - so {@link ApiConnectionResolver} lets
 * the lookup through unchecked there, exactly as the S3 resolver does. Without this validator a
 * caller could put any id in a step and have the server dial that tenant's endpoint with that
 * tenant's stored credentials. Resolving here, while the caller is still on the thread, forces the
 * ownership check to run.
 *
 * <p>Registered as a {@link PipelineStepValidator} so both entry points cover it: save-time
 * validation of a stored policy, and {@code PolicyController}'s ad-hoc gate.
 */
@Component
@RequiredArgsConstructor
public class IntegrationStepValidator implements PipelineStepValidator {

    static final String CONNECTION_ID_PARAM = "connectionId";
    private static final String INTEGRATION_PREFIX = "/api/v1/integration/";

    /**
     * Which connection type each integration step dereferences. A step under {@link
     * #INTEGRATION_PREFIX} that is absent here is rejected rather than waved through, so a new
     * endpoint cannot quietly skip this check by forgetting to register.
     */
    private static final Map<String, IntegrationType> STEP_CONNECTION_TYPES =
            Map.of(
                    "/api/v1/integration/external-api-call", IntegrationType.API,
                    "/api/v1/integration/purview-apply-label", IntegrationType.PURVIEW,
                    "/api/v1/integration/purview-read-label", IntegrationType.PURVIEW,
                    "/api/v1/integration/consigno-submit", IntegrationType.CONSIGNO,
                    "/api/v1/integration/consigno-fetch-signed", IntegrationType.CONSIGNO);

    private final ApiConnectionResolver connectionResolver;

    @Override
    public void validate(PipelineStep step) {
        String operation = step.operation();
        if (operation == null || !operation.startsWith(INTEGRATION_PREFIX)) {
            return;
        }
        IntegrationType type = STEP_CONNECTION_TYPES.get(operation);
        if (type == null) {
            throw new IllegalArgumentException("unknown integration step: " + operation);
        }
        Long connectionId =
                ApiConnectionResolver.connectionId(step.parameters().get(CONNECTION_ID_PARAM));
        if (connectionId == null) {
            throw new IllegalArgumentException(
                    operation + " requires a '" + CONNECTION_ID_PARAM + "' parameter");
        }
        // Throws if the connection is missing, the wrong type, disabled, or not usable by the
        // caller. The parsed settings are discarded: this call is the check.
        connectionResolver.resolveConfig(connectionId, type);
    }
}
