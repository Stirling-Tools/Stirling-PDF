package stirling.software.saas.payg.cap;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import stirling.software.saas.payg.model.FeatureGate;

/**
 * Declares which {@link FeatureGate}(s) a controller method requires. Read at request time by
 * {@code EntitlementGuard}; if any required gate is not in the team's currently-enabled gates the
 * request is rejected with HTTP 402.
 *
 * <p>The annotation is <em>not required</em> on every endpoint. The guard's default rule is:
 *
 * <ul>
 *   <li>{@code @RequiresFeature} present → use exactly those gates.
 *   <li>No annotation, but the method has {@code @AutoJobPostMapping} → assume {@link
 *       FeatureGate#OFFSITE_PROCESSING}.
 *   <li>Neither → skip (admin endpoints, info, config — these don't accrue charges and shouldn't
 *       degrade).
 * </ul>
 *
 * <p>So the only endpoints that need this annotation explicitly are those whose gate is
 * <em>different</em> from the default {@code OFFSITE_PROCESSING} — chiefly {@code
 * PipelineController} ({@link FeatureGate#AUTOMATION}) and the AI proxy layer ({@link
 * FeatureGate#AI_SUPPORT}). Per-tool proliferation of the annotation is intentional non-goal.
 *
 * <p>Multiple gates declared = ALL must be enabled (AND, not OR). Realistic usage is single-gate;
 * the array form is here for future combinations (e.g. an AI workflow inside a pipeline that needs
 * both {@code AUTOMATION} and {@code AI_SUPPORT}).
 *
 * <pre>{@code
 * @RequiresFeature(FeatureGate.AUTOMATION)
 * @AutoJobPostMapping("/pipeline")
 * public ResponseEntity<...> runPipeline(@ModelAttribute PipelineRequest req) { ... }
 * }</pre>
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresFeature {

    /** One or more gates that must all be enabled for the request to proceed. */
    FeatureGate[] value();
}
