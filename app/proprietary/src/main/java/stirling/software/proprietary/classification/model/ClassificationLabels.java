package stirling.software.proprietary.classification.model;

import java.util.List;

/**
 * A flat multi-label classification vocabulary — the set of labels a document may be assigned. The
 * classifier runs against these label names. The vocabulary is a fixed, built-in set shared by
 * everyone (see {@link stirling.software.proprietary.classification.ClassificationLabelProvider});
 * this record is the JSON parse target for that bundled resource.
 */
public record ClassificationLabels(List<ClassificationLabel> labels) {

    public ClassificationLabels {
        labels = labels == null ? List.of() : List.copyOf(labels);
    }
}
