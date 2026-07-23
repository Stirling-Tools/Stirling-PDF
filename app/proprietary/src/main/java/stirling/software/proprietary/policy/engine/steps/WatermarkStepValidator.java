package stirling.software.proprietary.policy.engine.steps;

import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.engine.PolicyStepValidator;
import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * A text watermark with no text fails the add-watermark endpoint on every document, so it is
 * refused at save. Image watermarks carry their content in {@code fileParameters} and are not
 * checked here.
 */
@Service
public class WatermarkStepValidator implements PolicyStepValidator {

    private static final String ENDPOINT = "/api/v1/security/add-watermark";

    @Override
    public boolean supports(String operation) {
        return ENDPOINT.equals(operation);
    }

    @Override
    public void validate(PipelineStep step) {
        Object type = step.parameters().get("watermarkType");
        if ("image".equals(type)) {
            return;
        }
        Object text = step.parameters().get("watermarkText");
        if (!(text instanceof String s) || s.isBlank()) {
            throw new IllegalArgumentException(
                    "watermark step needs watermark text — without it the policy fails on every"
                            + " document");
        }
    }
}
