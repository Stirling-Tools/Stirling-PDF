package stirling.software.proprietary.policy.engine.steps;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.engine.PolicyStepValidator;
import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * An automatic redact step with nothing to redact silently no-ops — a "security" policy that
 * reports success while removing nothing — so it is refused at save. Manual-mode redaction carries
 * its regions differently and is not checked here.
 */
@Service
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class RedactStepValidator implements PolicyStepValidator {

    private static final String ENDPOINT = "/api/v1/security/auto-redact";

    @Override
    public boolean supports(String operation) {
        return ENDPOINT.equals(operation);
    }

    @Override
    public void validate(PipelineStep step) {
        Object mode = step.parameters().getOrDefault("mode", "automatic");
        if (!"automatic".equals(mode)) {
            return;
        }
        Object words = step.parameters().get("wordsToRedact");
        if (!(words instanceof List<?> list) || list.isEmpty()) {
            throw new IllegalArgumentException(
                    "redact step needs at least one pattern to redact — with none it does"
                            + " nothing");
        }
    }
}
