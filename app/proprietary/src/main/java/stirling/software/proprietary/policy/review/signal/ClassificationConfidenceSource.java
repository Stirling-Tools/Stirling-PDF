package stirling.software.proprietary.policy.review.signal;

import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.review.ClassificationMetadataReader;
import stirling.software.proprietary.policy.review.ClassificationOutcome;
import stirling.software.proprietary.policy.review.LabelScore;

/**
 * The classifier as a confidence producer: one signal per assigned label, subject-scoped to that
 * label id so the reviewer sees which label the model was unsure about.
 *
 * <p>Classification has its own metadata key (it predates {@link MetadataConfidenceSource}'s
 * generic one), which is the only reason it needs a bean of its own rather than just writing
 * signals.
 *
 * <p>Assignments carrying no confidence — documents labelled before confidences existed — yield no
 * signal at all, so an old file can never read as "unsure" just because the number is missing.
 */
@Component
@RequiredArgsConstructor
public class ClassificationConfidenceSource implements ConfidenceSignalSource {

    public static final String PRODUCER = "classification";

    private final ClassificationMetadataReader metadataReader;

    @Override
    public String producer() {
        return PRODUCER;
    }

    @Override
    public List<ConfidenceSignal> read(Resource output) {
        return metadataReader.read(output).map(this::from).orElseGet(List::of);
    }

    /**
     * Signals from an outcome the caller already read, so the gate doesn't reopen the PDF for a key
     * it has in hand.
     */
    public List<ConfidenceSignal> from(ClassificationOutcome outcome) {
        return outcome.assignments().stream()
                .filter(assignment -> assignment.confidence() != null)
                .map(this::toSignal)
                .toList();
    }

    private ConfidenceSignal toSignal(LabelScore assignment) {
        return new ConfidenceSignal(PRODUCER, assignment.labelId(), assignment.confidence());
    }
}
