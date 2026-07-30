package stirling.software.common.model.tool;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declares what a tool endpoint consumes and produces, so a chain of steps can be checked before it
 * is run rather than failing part-way through a job.
 *
 * <p>This is the single source of truth for that information. It is read directly off the handler
 * method by {@code ToolIORegistry}, published into the OpenAPI spec as the {@code x-stirling-io}
 * extension, and generated from there into the frontend and the AI engine, so the three consumers
 * cannot drift from the backend or from each other.
 *
 * <p>The defaults describe the common case - one PDF in, one PDF out - so most endpoints only
 * declare what differs:
 *
 * <pre>{@code
 * @ToolIO(produces = ToolFormat.PDF_ENCRYPTED)                          // add-password
 * @ToolIO(accepts = ToolFormat.PDF_ENCRYPTED, produces = ToolFormat.PDF) // remove-password
 * @ToolIO(produces = ToolFormat.PDF, arity = ToolArity.SIMO)            // split-pages
 * @ToolIO(produces = ToolFormat.IMAGE, arity = ToolArity.SIMO)          // extract-images
 * @ToolIO(produces = ToolFormat.ZIP)                                    // get-attachments
 * }</pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ToolIO {

    /**
     * The formats this endpoint can be given. Defaults to a plain PDF, which is what makes every
     * ordinary endpoint reject an encrypted one without saying so.
     */
    ToolFormat[] accepts() default {ToolFormat.PDF};

    /** The format this endpoint returns, unless a {@link #cases()} entry overrides it. */
    ToolFormat produces();

    /** How many files go in and come out. See {@link ToolArity} for the ZIP-transport rule. */
    ToolArity arity() default ToolArity.SISO;

    /**
     * Overrides for endpoints whose output depends on a parameter value, evaluated in order with
     * the first match winning. Keeping this declarative rather than a callback is what lets the
     * whole declaration be generated into TypeScript and Python.
     */
    ToolIOCase[] cases() default {};
}
