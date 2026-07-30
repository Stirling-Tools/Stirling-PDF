package stirling.software.proprietary.policy.engine.steps;

import org.springframework.stereotype.Component;

import stirling.software.proprietary.policy.engine.PipelineStepValidator;
import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * An auto-redact step with nothing to redact silently no-ops — a "security" policy that reports
 * success while removing nothing — so it is refused at save. On the wire the terms travel as {@code
 * listOfText}, a newline-joined string (see RedactPdfRequest).
 */
@Component
public class RedactStepValidator implements PipelineStepValidator {

    private static final String ENDPOINT = "/api/v1/security/auto-redact";

    @Override
    public void validate(PipelineStep step) {
        if (!ENDPOINT.equals(step.operation())) {
            return;
        }
        Object listOfText = step.parameters().get("listOfText");
        if (!(listOfText instanceof String s) || s.isBlank()) {
            throw new IllegalArgumentException(
                    "redact step needs at least one pattern to redact — with none it does"
                            + " nothing");
        }
    }
}
