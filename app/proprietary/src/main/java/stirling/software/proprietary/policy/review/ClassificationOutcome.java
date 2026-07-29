package stirling.software.proprietary.policy.review;

import java.util.List;

/**
 * What classification said about a run's output, read back from the PDF's {@code
 * StirlingPDFClassification} metadata (the classify tool writes the engine's response JSON there
 * verbatim). Present only when a classify step actually ran on the file.
 */
public record ClassificationOutcome(
        List<LabelScore> assignments, List<ConsideredLabel> considered) {

    public ClassificationOutcome {
        assignments = assignments == null ? List.of() : List.copyOf(assignments);
        considered = considered == null ? List.of() : List.copyOf(considered);
    }
}
