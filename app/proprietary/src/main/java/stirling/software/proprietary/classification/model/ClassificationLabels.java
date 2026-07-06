package stirling.software.proprietary.classification.model;

import java.util.List;

/**
 * A flat multi-label classification vocabulary — the set of labels a document may be assigned.
 * Stored per team (admin-edited, shared by everyone on the team) and additionally per user (an
 * additive personal set); the classifier runs against the merged label names. When neither scope
 * has a stored set the engine falls back to its built-in default vocabulary.
 */
public record ClassificationLabels(List<ClassificationLabel> labels) {

    public ClassificationLabels {
        labels = labels == null ? List.of() : List.copyOf(labels);
    }
}
