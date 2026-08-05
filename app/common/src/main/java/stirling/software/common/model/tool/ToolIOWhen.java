package stirling.software.common.model.tool;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/** One condition on a request parameter, guarding a {@link ToolIOCase}. */
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ToolIOWhen {

    String param();

    /**
     * Compared as strings, case-insensitively. An empty string matches an absent or blank value.
     */
    String[] matches();
}
