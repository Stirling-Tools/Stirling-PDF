package stirling.software.proprietary.policy.model;

import java.util.List;
import java.util.Map;

import org.springframework.core.io.Resource;

/**
 * A run's files. {@code primary} documents flow step to step; {@code supportingFiles} are auxiliary
 * assets bound by key via {@link PipelineStep#fileParameters()} and never enter the document
 * stream. Asset values are lists so one key can carry a multi-file field (e.g. attachments).
 */
public record PolicyInputs(List<Resource> primary, Map<String, List<Resource>> supportingFiles) {

    public PolicyInputs {
        primary = primary == null ? List.of() : primary;
        supportingFiles = supportingFiles == null ? Map.of() : supportingFiles;
    }

    /** Inputs with primary documents only and no supporting files. */
    public static PolicyInputs of(List<Resource> primary) {
        return new PolicyInputs(primary, Map.of());
    }
}
