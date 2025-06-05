package stirling.software.common.annotations;

import java.lang.annotation.*;

import org.springframework.core.annotation.AliasFor;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@RequestMapping(method = RequestMethod.POST)
public @interface AutoJobPostMapping {
    @AliasFor(annotation = RequestMapping.class, attribute = "value")
    String[] value() default {};

    @AliasFor(annotation = RequestMapping.class, attribute = "consumes")
    String[] consumes() default {"multipart/form-data"};

    /**
     * Custom timeout in milliseconds for this specific job. If not specified, the default system
     * timeout will be used.
     */
    long timeout() default -1;

    /** Maximum number of times to retry the job on failure. Default is 1 (no retries). */
    int retryCount() default 1;

    /**
     * Whether to track and report progress for this job. If enabled, the job will send progress
     * updates through WebSocket.
     */
    boolean trackProgress() default true;

    /**
     * Whether this job can be queued when system resources are limited. If enabled, jobs will be
     * queued instead of rejected when the system is under high load. The queue size is dynamically
     * adjusted based on available memory and CPU resources.
     */
    boolean queueable() default false;

    /**
     * Optional resource weight of this job (1-100). Higher values indicate more resource-intensive
     * jobs that may need stricter queuing. Default is 50 (medium weight).
     */
    int resourceWeight() default 50;
}
