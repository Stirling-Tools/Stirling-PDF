package stirling.software.common.annotations;

import java.lang.annotation.*;

import jakarta.enterprise.util.Nonbinding;
import jakarta.interceptor.InterceptorBinding;
import jakarta.ws.rs.core.MediaType;

import io.swagger.v3.oas.annotations.parameters.RequestBody;

/**
 * Shortcut for a POST endpoint that is executed through the Stirling "auto‑job" framework.
 *
 * <p>MIGRATION (Spring -> Quarkus): this was a Spring composed meta-annotation that stamped
 * {@code @RequestMapping(method=POST)} onto the target via {@code @AliasFor}. JAX-RS does not honour
 * {@code @Path}/{@code @POST}/{@code @Consumes} through meta-annotations, so this annotation no
 * longer provides routing. It is now a CDI {@link InterceptorBinding} handled by
 * {@code AutoJobInterceptor}. <b>Controllers using {@code @AutoJobPostMapping} must additionally
 * declare their own JAX-RS {@code @POST} + {@code @Path(value)} + {@code @Consumes(consumes)}.</b>
 * The {@link #value()}/{@link #consumes()} members are retained so a scanner/controller can read the
 * intended routing.
 *
 * <p>Behaviour notes:
 *
 * <ul>
 *   <li>When the client supplies {@code ?async=true} the call is handed to {@link
 *       stirling.software.common.service.JobExecutorService JobExecutorService} where it may be
 *       queued, retried, tracked and subject to time‑outs. For synchronous (default) invocations
 *       these advanced options are ignored.
 *   <li>Progress information (see {@link #trackProgress()}) is stored in {@link
 *       stirling.software.common.service.TaskManager TaskManager} and can be polled via <code>
 *       GET /api/v1/general/job/{id}</code>.
 * </ul>
 *
 * <p>Unless stated otherwise an attribute only affects <em>async</em> execution. All members are
 * {@code @Nonbinding} so the single {@code AutoJobInterceptor} matches every annotated method; the
 * interceptor reads the actual values reflectively from the target method.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@InterceptorBinding
@RequestBody(required = true)
public @interface AutoJobPostMapping {

    /** The path mapping of the endpoint (controllers must mirror this on a JAX-RS {@code @Path}). */
    @Nonbinding
    String[] value() default {};

    /** MIME types this endpoint accepts. Defaults to {@code multipart/form-data}. */
    @Nonbinding
    String[] consumes() default {MediaType.MULTIPART_FORM_DATA};

    /**
     * Maximum execution time in milliseconds before the job is aborted. A negative value means "use
     * the application default".
     *
     * <p>Only honoured when {@code async=true}.
     */
    @Nonbinding
    long timeout() default -1;

    /**
     * Total number of attempts (initial + retries). Must be at least&nbsp;1. Retries are executed
     * with exponential back‑off.
     *
     * <p>Only honoured when {@code async=true}.
     */
    @Nonbinding
    int retryCount() default 1;

    /**
     * Record percentage / note updates so they can be retrieved via the REST status endpoint.
     *
     * <p>Only honoured when {@code async=true}.
     */
    @Nonbinding
    boolean trackProgress() default true;

    /**
     * If {@code true} the job may be placed in a queue instead of being rejected when resources are
     * scarce.
     *
     * <p>Only honoured when {@code async=true}.
     */
    @Nonbinding
    boolean queueable() default false;

    /**
     * Relative resource weight (1-100). See {@link
     * stirling.software.common.enumeration.ResourceWeight} for the standard tiers.
     *
     * <p>The default is a sentinel ({@link Integer#MIN_VALUE}); {@code
     * AutoJobPostMappingWeightTest} fails the build if any endpoint leaves it unset. Runtime
     * readers clamp the value into {@code [1, 100]}.
     */
    @Nonbinding
    int resourceWeight() default Integer.MIN_VALUE;
}
