package stirling.software.proprietary.classification.model;

import java.util.List;

/**
 * A flat multi-label classification vocabulary — the set of labels a document may be assigned.
 * Stored per team (admin-edited, shared by everyone on the team); the classifier runs against these
 * label names. A team with no stored set has no vocabulary, so its documents are not classified —
 * neither the backend nor the engine holds a default of its own.
 */
public record ClassificationLabels(List<ClassificationLabel> labels) {

    public ClassificationLabels {
        labels = labels == null ? List.of() : List.copyOf(labels);
    }
}
