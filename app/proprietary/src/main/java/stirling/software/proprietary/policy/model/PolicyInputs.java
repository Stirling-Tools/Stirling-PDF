package stirling.software.proprietary.policy.model;

import java.util.List;
import java.util.Map;

import org.springframework.core.io.Resource;

/**
 * The files a run operates on, split into two roles:
 *
 * <ul>
 *   <li>{@code primary} - the documents that flow through the pipeline, each step's output becoming
 *       the next step's input.
 *   <li>{@code supportingFiles} - a named store of auxiliary files (a stamp image, certificate,
 *       overlay, attachments) that steps bind to their named file fields via {@link
 *       PipelineStep#fileParameters()}. These never enter the document stream.
 * </ul>
 *
 * Asset values are lists so a single key can carry multi-file fields (e.g. attachments).
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
