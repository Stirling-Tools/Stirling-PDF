package stirling.software.common.model.tool;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/**
 * An output that applies when every condition in {@link #when()} holds.
 *
 * <p>Conditions are ANDed because the interesting branches turn on more than one parameter: Add
 * Password only leaves the document unencrypted when both passwords are absent.
 */
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ToolIOCase {

    ToolIOWhen[] when();

    ToolFormat produces();

    ToolArity arity();
}
