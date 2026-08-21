package stirling.software.common.model.tool;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * What a tool endpoint consumes and produces, so a chain of steps can be checked before it runs.
 *
 * <p>The single source of truth: read off the handler method by {@code ToolIORegistry}, published
 * into the OpenAPI spec as {@code x-stirling-io}, and generated from there into the frontend and
 * the AI engine.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ToolIO {

    /** Defaulting to a plain PDF is what makes an ordinary endpoint reject an encrypted one. */
    ToolFormat[] accepts() default {ToolFormat.PDF};

    ToolFormat produces();

    ToolArity arity() default ToolArity.SISO;

    /** Overrides for an output that depends on a parameter; first match wins. */
    ToolIOCase[] cases() default {};
}
