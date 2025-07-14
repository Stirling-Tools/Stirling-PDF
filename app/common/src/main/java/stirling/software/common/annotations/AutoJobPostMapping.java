package stirling.software.common.annotations;

import java.lang.annotation.*;

import org.springframework.core.annotation.AliasFor;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

/**
 * Shortcut for a POST endpoint that is executed through the Stirling "auto‑job" framework.
 *
 * <p>Behaviour notes:
 *
 * <ul>
 *   <li>The endpoint is registered with {@code POST} and, by default, consumes {@code
 *       multipart/form-data} unless you override {@link #consumes()}.
 *   <li>When the client supplies {@code ?async=true} the call is handed to {@link
 *       stirling.software.common.service.JobExecutorService JobExecutorService} where it may be
 *       queued, retried, tracked and subject to time‑outs. For synchronous (default) invocations
 *       these advanced options are ignored.
 *   <li>Progress information (see {@link #trackProgress()}) is stored in {@link
 *       stirling.software.common.service.TaskManager TaskManager} and can be polled via <code>
 *       GET /api/v1/general/job/{id}</code>.
 * </ul>
 *
 * <p>Unless stated otherwise an attribute only affects <em>async</em> execution.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@RequestMapping(method = RequestMethod.POST)
public @interface AutoJobPostMapping {

    /** Alias for {@link RequestMapping#value} – the path mapping of the endpoint. */
    @AliasFor(annotation = RequestMapping.class, attribute = "value")
    String[] value() default {};

    /** MIME types this endpoint accepts. Defaults to {@code multipart/form-data}. */
    @AliasFor(annotation = RequestMapping.class, attribute = "consumes")
    String[] consumes() default {"multipart/form-data"};

    /**
     * Maximum execution time in milliseconds before the job is aborted. A negative value means "use
     * the application default".
     *
     * <p>Only honoured when {@code async=true}.
     */
    long timeout() default -1;

    /**
     * Total number of attempts (initial + retries). Must be at least&nbsp;1. Retries are executed
     * with exponential back‑off.
     *
     * <p>Only honoured when {@code async=true}.
     */
    int retryCount() default 1;

    /**
     * Record percentage / note updates so they can be retrieved via the REST status endpoint.
     *
     * <p>Only honoured when {@code async=true}.
     */
    boolean trackProgress() default true;

    /**
     * If {@code true} the job may be placed in a queue instead of being rejected when resources are
     * scarce.
     *
     * <p>Only honoured when {@code async=true}.
     */
    boolean queueable() default false;

    /**
     * Relative resource weight (1–100) used by the scheduler to prioritise / throttle jobs. Values
     * below 1 are clamped to&nbsp;1, values above 100 to&nbsp;100.
     */
    int resourceWeight() default 50;
}
