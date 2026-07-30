package stirling.software.proprietary.model.docparse;

import java.util.List;

/**
 * What the engine can actually do right now; Java caches and republishes this. Mirrors {@code
 * docparse.py DocparseCapabilities}.
 */
public record DocparseCapabilities(
        boolean advancedInstalled,
        String doclingVersion,
        String torchVersion,
        boolean modelsAvailable,
        String modelsPath,
        List<String> errors) {

    public DocparseCapabilities {
        errors = errors == null ? List.of() : errors;
    }

    /** The addon-absent view used when the engine is disabled, unreachable, or probing failed. */
    public static DocparseCapabilities absent(String reason) {
        return new DocparseCapabilities(false, null, null, false, null, List.of(reason));
    }
}
