package stirling.software.proprietary.policy.engine.steps;

import org.springframework.stereotype.Component;

import stirling.software.proprietary.policy.engine.PipelineStepValidator;
import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * A text watermark with no text stamps nothing on every document, so the step is refused at save.
 * Image watermarks carry their content as an asset instead of a parameter and are not checked here.
 */
@Component
public class WatermarkStepValidator implements PipelineStepValidator {

    private static final String ENDPOINT = "/api/v1/security/add-watermark";

    @Override
    public void validate(PipelineStep step) {
        if (!ENDPOINT.equals(step.operation())) {
            return;
        }
        Object watermarkType = step.parameters().get("watermarkType");
        if ("image".equals(watermarkType)) {
            return;
        }
        Object watermarkText = step.parameters().get("watermarkText");
        if (!(watermarkText instanceof String s) || s.isBlank()) {
            throw new IllegalArgumentException(
                    "watermark step needs watermark text — without it the policy fails on every"
                            + " document");
        }
    }
}
