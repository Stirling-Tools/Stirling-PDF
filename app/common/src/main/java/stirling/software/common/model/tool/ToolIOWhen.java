package stirling.software.common.model.tool;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/** One condition on a request parameter, used to guard a {@link ToolIOCase}. */
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ToolIOWhen {

    /** The request parameter this condition reads. */
    String param();

    /**
     * The values that satisfy the condition, compared as strings and case-insensitively. An empty
     * string matches an absent or blank value.
     */
    String[] matches();
}
