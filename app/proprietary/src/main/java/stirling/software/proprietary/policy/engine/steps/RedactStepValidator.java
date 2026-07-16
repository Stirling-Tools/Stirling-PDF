package stirling.software.proprietary.policy.engine.steps;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.engine.PolicyStepValidator;
import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * An auto-redact step with nothing to redact silently no-ops — a "security" policy that reports
 * success while removing nothing — so it is refused at save. On the wire the terms travel as {@code
 * listOfText}, a newline-joined string (see RedactPdfRequest).
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
        Object listOfText = step.parameters().get("listOfText");
        if (!(listOfText instanceof String s) || s.isBlank()) {
            throw new IllegalArgumentException(
                    "redact step needs at least one pattern to redact — with none it does"
                            + " nothing");
        }
    }
}
