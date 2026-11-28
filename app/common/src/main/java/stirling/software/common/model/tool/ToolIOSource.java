package stirling.software.common.model.tool;

import java.util.Map;
import java.util.Optional;

/**
 * Supplies the {@link ToolIO} declaration for an endpoint path. An interface so a chain can be
 * checked against a fixed set of declarations without standing up an application context.
 */
@FunctionalInterface
public interface ToolIOSource {

    Optional<ToolIOSpec> find(String operationPath);

    /**
     * Whether a pipeline step may name this path at all. A source that cannot list every runnable
     * endpoint answers true, leaving a missing declaration to be reported as merely undeclared.
     */
    default boolean isKnown(String operationPath) {
        return true;
    }

    static ToolIOSource of(Map<String, ToolIOSpec> specs) {
        Map<String, ToolIOSpec> copy = Map.copyOf(specs);
        return path -> Optional.ofNullable(copy.get(path));
    }
}
