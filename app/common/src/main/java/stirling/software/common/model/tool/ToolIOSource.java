package stirling.software.common.model.tool;

import java.util.Map;
import java.util.Optional;

/**
 * Supplies the {@link ToolIO} declaration for an endpoint path.
 *
 * <p>In the running application this is the registry that read the annotations at startup. It is an
 * interface so a chain can also be checked against a known set of declarations - a test fixture, or
 * a subset filtered to what a particular caller may use - without standing up an application
 * context.
 */
@FunctionalInterface
public interface ToolIOSource {

    /** The declaration for an endpoint path, or empty when it declares none. */
    Optional<ToolIOSpec> find(String operationPath);

    /** A source over a fixed set of declarations. */
    static ToolIOSource of(Map<String, ToolIOSpec> specs) {
        Map<String, ToolIOSpec> copy = Map.copyOf(specs);
        return path -> Optional.ofNullable(copy.get(path));
    }
}
