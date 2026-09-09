package stirling.software.saas.payg.cap;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotationUtils;

import stirling.software.saas.ai.controller.AiCreateController;
import stirling.software.saas.ai.controller.AiCreateInternalController;
import stirling.software.saas.ai.controller.AiProxyController;
import stirling.software.saas.payg.model.FeatureGate;

/**
 * Annotation-rollout guard. The saas {@code PaygChargeInterceptor} reads class-level
 * {@code @RequiresFeature} via {@link AnnotationUtils#findAnnotation(Class, Class)} to decide
 * whether a request bills as {@code AI}, {@code AUTOMATION}, or falls through to the auth-derived
 * default. These tests pin the gate on each AI surface so the classification can't silently regress
 * to {@code BYPASSED} if someone strips the annotation while refactoring.
 *
 * <p><b>Out of scope</b>: {@code PipelineController} (in core) and {@code PolicyController} (in
 * proprietary) — neither module can import {@code @RequiresFeature} from saas without a forbidden
 * upward dependency. Their automation classification is enforced via the {@code
 * X-Stirling-Automation} header set unconditionally by {@code InternalApiClient.post}; see the
 * dedicated test in that module.
 */
class RequiresFeatureAnnotationRolloutTest {

    @Test
    void aiCreateController_isClassifiedAsAiSupport() {
        RequiresFeature ann =
                AnnotationUtils.findAnnotation(AiCreateController.class, RequiresFeature.class);
        assertThat(ann).isNotNull();
        assertThat(ann.value()).containsExactly(FeatureGate.AI_SUPPORT);
    }

    @Test
    void aiCreateInternalController_isClassifiedAsAiSupport() {
        RequiresFeature ann =
                AnnotationUtils.findAnnotation(
                        AiCreateInternalController.class, RequiresFeature.class);
        assertThat(ann).isNotNull();
        assertThat(ann.value()).containsExactly(FeatureGate.AI_SUPPORT);
    }

    @Test
    void aiProxyController_isClassifiedAsAiSupport() {
        RequiresFeature ann =
                AnnotationUtils.findAnnotation(AiProxyController.class, RequiresFeature.class);
        assertThat(ann).isNotNull();
        assertThat(ann.value()).containsExactly(FeatureGate.AI_SUPPORT);
    }
}
